import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fs from "fs";
import Knex from "knex";
import path from "path";

type MigrationHandlerResult = {
  statusCode: number;
  body: string;
};

type RdsCredentials = {
  username: string;
  password: string;
};

type DatabaseConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const parseEndpoint = (endpoint: string): { host: string; port: number } => {
  const [host, portString] = endpoint.split(":");
  const port = Number(portString);

  if (!host || !portString || Number.isNaN(port)) {
    throw new Error(`Invalid RDS_ENDPOINT: ${endpoint}`);
  }

  return { host, port };
};

const getRdsCredentials = async (secretArn: string): Promise<RdsCredentials> => {
  const secretsManager = new SecretsManagerClient({});
  const response = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error(`Secret "${secretArn}" does not contain a SecretString`);
  }

  const secret = JSON.parse(response.SecretString) as Partial<RdsCredentials>;

  if (!secret.username || !secret.password) {
    throw new Error(`Secret "${secretArn}" must include username and password`);
  }

  return {
    username: secret.username,
    password: secret.password,
  };
};

const getLocalConnection = (): DatabaseConnection => {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
  } = process.env;

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error("DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME are required for local migrations");
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

const getDatabaseConnection = async (): Promise<DatabaseConnection> => {
  const secretArn = process.env.RDS_SECRET_ARN;
  const endpoint = process.env.RDS_ENDPOINT;

  if (!secretArn && !endpoint) {
    return getLocalConnection();
  }

  if (!secretArn || !endpoint) {
    throw new Error(
      `Misconfiguration: RDS_SECRET_ARN and RDS_ENDPOINT must both be set or both be unset. ` +
      `RDS_SECRET_ARN=${secretArn ? "set" : "unset"}, RDS_ENDPOINT=${endpoint ? "set" : "unset"}`
    );
  }

  const { host, port } = parseEndpoint(endpoint);
  const { username, password } = await getRdsCredentials(secretArn);

  const database = process.env.RDS_DB_NAME ?? "paymentportal";

  return {
    host,
    port,
    user: username,
    password,
    database,
  };
};

const getMigrationsDirectory = (): string => {
  const bundledDirectory = path.join(__dirname, "db", "migrations");

  if (fs.existsSync(bundledDirectory)) {
    console.log(`[migrationHandler] using bundled migrations directory: ${bundledDirectory}`);
    return bundledDirectory;
  }

  const sourceDirectory = path.join(__dirname, "..", "db", "migrations");
  console.log(`[migrationHandler] using source migrations directory: ${sourceDirectory}`);
  return sourceDirectory;
};

// THIS WILL ONLY BE FOR CI/CD USAGE AND SHOULD NOT BE EXPOSED IN API GATEWAY
export const migrationHandler = async (): Promise<MigrationHandlerResult> => {
  const connection = await getDatabaseConnection();

  const knex = Knex({
    client: "pg",
    connection,
    pool: {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 10000,
    },
    migrations: {
      directory: getMigrationsDirectory(),
    },
  });

  try {
    const [batchNo, migrations] = await knex.migrate.latest();

    return {
      statusCode: 200,
      body: JSON.stringify({
        batchNo,
        migrations,
      }),
    };
  } finally {
    await knex.destroy();
  }
};
