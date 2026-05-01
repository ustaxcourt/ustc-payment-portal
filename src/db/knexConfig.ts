import type { Knex } from "knex";
import { knexSnakeCaseMappers } from "objection";

type SupportedEnv = "development" | "test" | "production";
type KnexEnv = SupportedEnv | "local" | "staging";

const {
  DB_HOST = "localhost",
  DB_PORT = "5432",
  DB_USER = "user",
  DB_PASSWORD = "password",
  DB_NAME = "mydb",
  DATABASE_URL,
} = process.env;

const baseConfig: Omit<Knex.Config, "connection"> = {
  client: "pg",
  migrations: {
    tableName: "knex_migrations",
    directory: "./db/migrations",
    extension: "ts",
  },
  seeds: {
    directory: "./db/seeds",
    extension: "ts",
  },
  pool: { min: 2, max: 10 },
  ...knexSnakeCaseMappers(),
};

const buildConnection = (
  environment: SupportedEnv,
): NonNullable<Knex.Config["connection"]> => {
  if (environment === "production" && DATABASE_URL) {
    return DATABASE_URL;
  }

  return {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: environment === "test" ? `${DB_NAME}_test` : DB_NAME,
  };
};

const coreKnexConfigs: Record<SupportedEnv, Knex.Config> = {
  development: {
    ...baseConfig,
    connection: buildConnection("development"),
  },
  test: {
    ...baseConfig,
    connection: buildConnection("test"),
  },
  production: {
    ...baseConfig,
    connection: buildConnection("production"),
  },
};

export const knexConfigs: Record<KnexEnv, Knex.Config> = {
  ...coreKnexConfigs,
  local: coreKnexConfigs.development,
  staging: coreKnexConfigs.production,
};

export const getKnexConfigForEnv = (
  env = process.env.NODE_ENV || "development",
): Knex.Config => {
  if (!(env in knexConfigs)) {
    throw new Error(
      `Unknown NODE_ENV "${env}". Expected one of: ${Object.keys(
        knexConfigs,
      ).join(", ")}`,
    );
  }
  return knexConfigs[env as KnexEnv];
};
