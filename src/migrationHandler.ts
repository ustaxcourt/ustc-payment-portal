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
  | "provision-user"
  | "deprovision-user"
  | "show-users"
  | "show-databases"
  | "migrate"
  | "rollback"
  | "unlock"
  | "seed"
  | "verify"
  | "gc-dbs"
  | "gc-roles";

type MigrationHandlerEvent = {
  command?: Command;
  openPrNumbers?: number[];
  // Required for the destructive `rollback` command; must be true or the
  // handler refuses to roll back. Guards against accidental invocation.
  confirm?: boolean;
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

const quoteSqlIdentifier = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`;

const quoteSqlLiteral = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;

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

const provisionUser = async (): Promise<MigrationHandlerResult> => {
  const prUserSecretArn = process.env.PR_USER_SECRET_ARN;
  if (!prUserSecretArn) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Skipping provision-user: PR_USER_SECRET_ARN is not set",
      }),
    };
  }

  const dbName = process.env.RDS_DB_NAME;
  if (!dbName) throw new Error("RDS_DB_NAME is not set");

  const { username: prRole, password: prPassword } = await getRdsSecret(
    prUserSecretArn,
  );

  const maintenanceKnex = await getMaintenanceKnex();
  try {
    const roleExistsResult = await maintenanceKnex.raw<{
      rows: { exists: boolean }[];
    }>(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = ?) AS exists`, [
      prRole,
    ]);

    if (roleExistsResult.rows[0].exists) {
      await maintenanceKnex.raw(
        `ALTER ROLE ${quoteSqlIdentifier(
          prRole,
        )} WITH LOGIN PASSWORD ${quoteSqlLiteral(prPassword)}`,
      );
    } else {
      await maintenanceKnex.raw(
        `CREATE ROLE ${quoteSqlIdentifier(
          prRole,
        )} LOGIN PASSWORD ${quoteSqlLiteral(prPassword)}`,
      );
    }
  } finally {
    await maintenanceKnex.destroy();
  }

  const connection = await getDatabaseConnection();
  const dbKnex = Knex({
    client: "pg",
    connection,
    pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 },
  });

  try {
    await dbKnex.raw(`GRANT CONNECT ON DATABASE ?? TO ??`, [dbName, prRole]);
    await dbKnex.raw(`GRANT USAGE ON SCHEMA public TO ??`, [prRole]);
    await dbKnex.raw(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ??`,
      [prRole],
    );
    await dbKnex.raw(
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ??`,
      [prRole],
    );
    await dbKnex.raw(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ?? IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ??`,
      [connection.user, prRole],
    );
    await dbKnex.raw(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ?? IN SCHEMA public
       GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ??`,
      [connection.user, prRole],
    );
  } finally {
    await dbKnex.destroy();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Provisioned role "${prRole}" for database "${dbName}"`,
    }),
  };
};

const deprovisionUser = async (): Promise<MigrationHandlerResult> => {
  const prUserSecretArn = process.env.PR_USER_SECRET_ARN;
  if (!prUserSecretArn) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Skipping deprovision-user: PR_USER_SECRET_ARN is not set",
      }),
    };
  }

  const { username: prRole } = await getRdsSecret(prUserSecretArn);
  const connection = await getDatabaseConnection();

  const dbKnex = Knex({
    client: "pg",
    connection,
    pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 },
  });

  try {
    // REASSIGN OWNED BY / DROP OWNED BY both error if the role doesn't exist,
    // which would mask a clean teardown (role was never created, or a previous
    // deprovision-user already ran). Short-circuit if the role isn't there.
    const roleExistsResult = await dbKnex.raw<{
      rows: { exists: boolean }[];
    }>(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = ?) AS exists`, [
      prRole,
    ]);

    if (!roleExistsResult.rows[0].exists) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Role "${prRole}" does not exist; nothing to deprovision`,
        }),
      };
    }

    await dbKnex.raw(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE usename = ?
         AND pid <> pg_backend_pid()`,
      [prRole],
    );
    await dbKnex.raw(`REASSIGN OWNED BY ?? TO ??`, [prRole, connection.user]);
    await dbKnex.raw(`DROP OWNED BY ??`, [prRole]);
  } finally {
    await dbKnex.destroy();
  }

  const maintenanceKnex = await getMaintenanceKnex();
  try {
    await maintenanceKnex.raw(`DROP ROLE IF EXISTS ??`, [prRole]);
  } finally {
    await maintenanceKnex.destroy();
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: `Deprovisioned role "${prRole}"` }),
  };
};

const showUsers = async (): Promise<MigrationHandlerResult> => {
  const knex = await getMaintenanceKnex();
  try {
    const result = await knex.raw<{ rows: { username: string }[] }>(
      `SELECT usename AS username FROM pg_user ORDER BY usename`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ users: result.rows.map((row) => row.username) }),
    };
  } finally {
    await knex.destroy();
  }
};

const showDatabases = async (): Promise<MigrationHandlerResult> => {
  const knex = await getMaintenanceKnex();

  try {
    const result = await knex.raw<{ rows: { databaseName: string }[] }>(
      `SELECT datname AS "databaseName"
       FROM pg_database
       WHERE datistemplate = false
       ORDER BY datname`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        databases: result.rows.map((row) => row.databaseName),
      }),
    };
  } finally {
    await knex.destroy();
  }
};

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

/**
 * Drops all pr_user_pr_* roles that are not in the provided list of open PR numbers.
 * Run after gc-dbs in the nightly workflow — the per-PR database is gone by then, so
 * the role no longer owns anything and DROP ROLE succeeds cleanly. Catches roles that
 * lingered because deprovision-user failed during PR teardown.
 */
const gcRoles = async (
  openPrNumbers: number[],
): Promise<MigrationHandlerResult> => {
  const knex = await getMaintenanceKnex();
  const dropped: string[] = [];
  const failed: { rolname: string; error: string }[] = [];
  try {
    const result = await knex.raw<{ rows: { rolname: string }[] }>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE 'pr_user_pr_%'`,
    );
    for (const { rolname } of result.rows) {
      const match = rolname.match(/^pr_user_pr_(\d+)$/);
      if (!match) continue;
      const prNumber = Number(match[1]);
      if (openPrNumbers.includes(prNumber)) continue;
      try {
        await knex.raw(`DROP ROLE IF EXISTS ??`, [rolname]);
        dropped.push(rolname);
        console.log(`[migrationHandler] gc-roles: dropped ${rolname}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ rolname, error: message });
        console.error(
          `[migrationHandler] gc-roles: failed to drop ${rolname}: ${message}`,
        );
      }
    }
  } finally {
    await knex.destroy();
  }
  return { statusCode: 200, body: JSON.stringify({ dropped, failed }) };
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
  if (command === "provision-user") return provisionUser();
  if (command === "deprovision-user") return deprovisionUser();
  if (command === "gc-dbs") {
    if (!event?.openPrNumbers?.length) {
      throw new Error(
        "gc-dbs requires a non-empty openPrNumbers array — omitting it would drop all PR databases",
      );
    }
    return gcDbs(event.openPrNumbers);
  }
  if (command === "gc-roles") {
    if (!event?.openPrNumbers?.length) {
      throw new Error(
        "gc-roles requires a non-empty openPrNumbers array — omitting it would drop all PR roles",
      );
    }
    return gcRoles(event.openPrNumbers);
  }
  if (command === "show-users") return showUsers();
  if (command === "show-databases") return showDatabases();

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

    if (command === "rollback") {
      if (event?.confirm !== true) {
        throw new Error(
          `rollback requires confirm:true — refusing to roll back the last batch ` +
            `on "${connection.database}" without explicit confirmation`,
        );
      }
      // Roll back only the last batch (= the most recent deploy that applied
      // migrations). `false` disables all-history rollback intentionally.
      const [batchNo, migrations] = await knex.migrate.rollback(undefined, false);
      // Knex returns [0, []] when there is nothing to revert. Signal that no-op
      // explicitly rather than leaving the caller to infer it from an empty list.
      const message =
        migrations.length === 0
          ? "No migration batch to roll back"
          : `Rolled back batch ${batchNo}`;
      // Audit line: names exactly what was reverted (or that nothing was).
      console.log(
        migrations.length === 0
          ? `[migrationHandler] rollback: nothing to revert`
          : `[migrationHandler] rollback: reverted batch ${batchNo} — ${migrations.join(
              ", ",
            )}`,
      );
      return {
        statusCode: 200,
        body: JSON.stringify({ batchNo, migrations, message }),
      };
    }

    if (command === "unlock") {
      if (event?.confirm !== true) {
        throw new Error(
          `unlock requires confirm:true — refusing to force-free the migration lock ` +
            `on "${connection.database}" without explicit confirmation. Confirm the ` +
            `interrupted run is actually dead first; unlocking a live run risks corruption.`,
        );
      }
      // Force-clears a stale knex_migrations_lock left behind by an abruptly-killed
      // run (e.g. a Lambda timeout), which otherwise blocks all future migrate/rollback.
      await knex.migrate.forceFreeMigrationsLock();
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Migration lock cleared" }),
      };
    }

    const [batchNo, migrations] = await knex.migrate.latest();
    return { statusCode: 200, body: JSON.stringify({ batchNo, migrations }) };
  } finally {
    await knex.destroy();
  }
};
