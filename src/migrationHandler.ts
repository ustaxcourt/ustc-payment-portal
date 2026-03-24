import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
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

export const migrationHandler = async (): Promise<MigrationHandlerResult> => {
  const secretArn = process.env["RDS_SECRET_ARN"];
  const endpoint = process.env["RDS_ENDPOINT"];

  if (!secretArn) {
    throw new Error("RDS_SECRET_ARN is required");
  }
  if (!endpoint) {
    throw new Error("RDS_ENDPOINT is required");
  }

  const { host, port } = parseEndpoint(endpoint);
  const { username, password } = await getRdsCredentials(secretArn);

  const knex = Knex({
    client: "pg",
    connection: {
      host,
      port,
      user: username,
      password,
      database: "paymentportal",
    },
    pool: {
      min: 0,
      max: 1,
    },
    migrations: {
      directory: path.join(__dirname, "db", "migrations"),
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
