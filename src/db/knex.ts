import Knex from 'knex';
import { Model, knexSnakeCaseMappers } from 'objection';
import { getRdsCredentials } from './getRdsCredentials';

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USER = 'user',
  DB_PASSWORD = 'password',
  DB_NAME = 'mydb',
  NODE_ENV = 'development',
  RDS_SECRET_ARN,
} = process.env;

let knexInstance: ReturnType<typeof Knex> | null = null;

function createKnexFromEnv(): ReturnType<typeof Knex> {
  const connection =
    NODE_ENV === 'production' && process.env.DATABASE_URL
      ? process.env.DATABASE_URL
      : {
        host: DB_HOST,
        port: Number(DB_PORT),
        user: DB_USER,
        password: DB_PASSWORD,
        database: NODE_ENV === 'test' ? `${DB_NAME}_test` : DB_NAME,
      };

  if (NODE_ENV !== 'production') {
    console.log(
      `[Knex] env=${NODE_ENV} db=${typeof connection === 'string' ? '(DATABASE_URL)' : connection.database}`
    );
  }

  return Knex({ client: 'pg', connection, pool: { min: 2, max: 10 }, ...knexSnakeCaseMappers() });
}

// Local dev / test path:  initialise synchronously so that importing this module
// in devServer.ts still triggers Model.knex() as a side effect.
if (!RDS_SECRET_ARN) {
  knexInstance = createKnexFromEnv();
  Model.knex(knexInstance);
}

// Lambda path: RDS_SECRET_ARN is set. Callers must await getKnex() before any
// query. Cached so SecretsManager is only hit on cold start.
export async function getKnex(): Promise<ReturnType<typeof Knex>> {
  if (knexInstance) return knexInstance;

  const connection = await getRdsCredentials();
  knexInstance = Knex({ client: 'pg', connection, pool: { min: 0, max: 2 }, ...knexSnakeCaseMappers() });
  Model.knex(knexInstance);
  return knexInstance;
}
