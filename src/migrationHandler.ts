import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import fs from "fs";
import Knex from "knex";
import { knexSnakeCaseMappers } from "objection";
import path from "path";
import { parseRdsEndpoint } from "./db/getRdsCredentials";

type Command =
  | "create-db"
  | "drop-db"
  | "migrate"
  | "seed"
  | "verify"
  | "gc-dbs";

type MigrationHandlerEvent = {
  command?: Command;
  openPrNumbers?: number[];
};

type MigrationHandlerResult = {
  statusCode: number;
  body: string;
};

type DatabaseConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
};

const getRdsSecret = async (
  secretArn: string,
): Promise<{ username: string; password: string }> => {
  const secretsManager = new SecretsManagerClient({});
  const response = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error(`Secret "${secretArn}" does not contain a SecretString`);
  }

  const secret = JSON.parse(response.SecretString) as Partial<{
    username: string;
    password: string;
  }>;

  if (!secret.username || !secret.password) {
    throw new Error(`Secret "${secretArn}" must include username and password`);
  }

  return { username: secret.username, password: secret.password };
};

const getLocalConnection = (): DatabaseConnection => {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      "DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME are required for local migrations",
    );
  }

  const port = Number(DB_PORT);

  if (Number.isNaN(port)) {
    throw new Error(`Invalid DB_PORT: ${DB_PORT}`);
  }

  return {
    host: DB_HOST,
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
};

const getRdsSslConfig = (): { rejectUnauthorized: boolean; ca?: Buffer } => {
  const caPath = path.join(__dirname, "rds-ca-bundle.pem");
  if (fs.existsSync(caPath)) {
    return { rejectUnauthorized: true, ca: fs.readFileSync(caPath) };
  }
  return { rejectUnauthorized: false };
};

const getDatabaseConnection = async (): Promise<DatabaseConnection> => {
  const secretArn = process.env.RDS_SECRET_ARN;
  const endpoint = process.env.RDS_ENDPOINT;

  if (!secretArn && !endpoint) {
    return getLocalConnection();
  }

  if (!secretArn || !endpoint) {
    throw new Error(
      `Misconfiguration: RDS_SECRET_ARN and RDS_ENDPOINT must both be set or both be unset. ` +
        `RDS_SECRET_ARN=${secretArn ? "set" : "unset"}, RDS_ENDPOINT=${
          endpoint ? "set" : "unset"
        }`,
    );
  }

  const { host, port } = parseRdsEndpoint(endpoint);
  const { username, password } = await getRdsSecret(secretArn);
  const database = process.env.RDS_DB_NAME ?? "paymentportal";

  return {
    host,
    port,
    user: username,
    password,
    database,
    ssl: getRdsSslConfig(),
  };
};

/**
 * Builds a Knex instance connected to the Postgres maintenance database ("postgres")
 * using the RDS master credentials. Required for CREATE/DROP DATABASE — DDL that
 * cannot run against the target database and requires CREATEDB privilege.
 */
const getMaintenanceKnex = async (): Promise<ReturnType<typeof Knex>> => {
  const masterSecretArn = process.env.RDS_MASTER_SECRET_ARN;
  if (!masterSecretArn) throw new Error("RDS_MASTER_SECRET_ARN is not set");

  const endpoint = process.env.RDS_ENDPOINT;
  if (!endpoint) throw new Error("RDS_ENDPOINT is not set");

  const { host, port } = parseRdsEndpoint(endpoint);
  const { username, password } = await getRdsSecret(masterSecretArn);

  return Knex({
    client: "pg",
    connection: {
      host,
      port,
      user: username,
      password,
      database: "postgres",
      ssl: getRdsSslConfig(),
    },
    pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 },
  });
};

const getMigrationsDirectory = (): string => {
  const bundledDirectory = path.join(__dirname, "db", "migrations");

  if (fs.existsSync(bundledDirectory)) {
    console.log(
      `[migrationHandler] using bundled migrations directory: ${bundledDirectory}`,
    );
    return bundledDirectory;
  }

  const sourceDirectory = path.join(__dirname, "..", "db", "migrations");
  console.log(
    `[migrationHandler] using source migrations directory: ${sourceDirectory}`,
  );
  return sourceDirectory;
};

const getSeedsDirectory = (): string => {
  const bundledDirectory = path.join(__dirname, "db", "seeds");

  if (fs.existsSync(bundledDirectory)) {
    return bundledDirectory;
  }

  return path.join(__dirname, "..", "db", "seeds");
};

// TODO: For better isolation, create a dedicated PostgreSQL user scoped to each
// PR database rather than reusing the shared admin credentials. This would prevent
// a PR environment from accidentally accessing another PR's database.
// At current team size this is low risk, but worth revisiting at DAWSON scale.
const createDb = async (): Promise<MigrationHandlerResult> => {
  const dbName = process.env.RDS_DB_NAME;
  if (!dbName) throw new Error("RDS_DB_NAME is not set");

  const knex = await getMaintenanceKnex();
  try {
    const result = await knex.raw<{ rows: { exists: boolean }[] }>(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ?) AS exists`,
      [dbName],
    );
    if (result.rows[0].exists) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Database "${dbName}" already exists`,
        }),
      };
    }
    await knex.raw(`CREATE DATABASE ??`, [dbName]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Database "${dbName}" created` }),
    };
  } catch (err) {
    try {
      await knex.raw(`DROP DATABASE IF EXISTS ?? WITH (FORCE)`, [dbName]);
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    await knex.destroy();
  }
};

const dropDb = async (): Promise<MigrationHandlerResult> => {
  const dbName = process.env.RDS_DB_NAME;
  if (!dbName) throw new Error("RDS_DB_NAME is not set");

  if (!/^paymentportal_pr_\d+$/.test(dbName)) {
    throw new Error(
      `Refusing to drop "${dbName}" — drop-db is only allowed for PR databases (paymentportal_pr_<number>)`,
    );
  }

  const knex = await getMaintenanceKnex();
  try {
    await knex.raw(`DROP DATABASE IF EXISTS ?? WITH (FORCE)`, [dbName]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Database "${dbName}" dropped` }),
    };
  } finally {
    await knex.destroy();
  }
};

/**
 * Drops all paymentportal_pr_* databases that are not in the provided list of open PR numbers.
 * Invoked by the nightly GC workflow on the always-present dev migrationRunner Lambda,
 * so cleanup succeeds even when the per-PR Lambda no longer exists.
 */
const gcDbs = async (
  openPrNumbers: number[],
): Promise<MigrationHandlerResult> => {
  const knex = await getMaintenanceKnex();
  const dropped: string[] = [];
  try {
    const result = await knex.raw<{ rows: { datname: string }[] }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'paymentportal_pr_%'`,
    );
    for (const { datname } of result.rows) {
      const match = datname.match(/^paymentportal_pr_(\d+)$/);
      if (!match) continue;
      const prNumber = Number(match[1]);
      if (openPrNumbers.includes(prNumber)) continue;
      await knex.raw(`DROP DATABASE IF EXISTS ?? WITH (FORCE)`, [datname]);
      dropped.push(datname);
      console.log(`[migrationHandler] gc-dbs: dropped ${datname}`);
    }
  } finally {
    await knex.destroy();
  }
  return { statusCode: 200, body: JSON.stringify({ dropped }) };
};

// THIS WILL ONLY BE FOR CI/CD USAGE AND SHOULD NOT BE EXPOSED IN API GATEWAY
// If we ever write integration tests for this Lambda or any of the dashboard endpoints,
// we will need to setup PR ephemeral environments to spin up a RDS instance, otherwise the tests
// will always fail.
export const migrationHandler = async (
  event?: MigrationHandlerEvent,
): Promise<MigrationHandlerResult> => {
  const command: Command = event?.command ?? "migrate";

  console.log(
    `[migrationHandler] command=${command} db=${
      process.env.RDS_DB_NAME ?? "(local)"
    }`,
  );

  if (command === "create-db") return createDb();
  if (command === "drop-db") return dropDb();
  if (command === "gc-dbs") {
    if (!event?.openPrNumbers?.length) {
      throw new Error(
        "gc-dbs requires a non-empty openPrNumbers array — omitting it would drop all PR databases",
      );
    }
    return gcDbs(event.openPrNumbers);
  }

  const connection = await getDatabaseConnection();

  const knex = Knex({
    client: "pg",
    connection,
    pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 },
    migrations: { directory: getMigrationsDirectory() },
    ...knexSnakeCaseMappers(),
  });

  try {
    if (command === "verify") {
      const version = await knex.migrate.currentVersion();
      return {
        statusCode: 200,
        body: JSON.stringify({ version: version ?? "none" }),
      };
    }

    if (command === "seed") {
      await knex.seed.run({ directory: getSeedsDirectory() });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Seeds completed" }),
      };
    }

    const [batchNo, migrations] = await knex.migrate.latest();
    return { statusCode: 200, body: JSON.stringify({ batchNo, migrations }) };
  } finally {
    await knex.destroy();
  }
};
