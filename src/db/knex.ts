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
      `[Dashboard Knex] env=${NODE_ENV} db=${typeof connection === 'string' ? '(DATABASE_URL)' : connection.database}`
    );
  }

  const knex = Knex({
    client: 'pg',
    connection,
    pool: { min: 2, max: 10 },
    ...knexSnakeCaseMappers(),
  });

  // Bind Objection models to this Knex instance
  Model.knex(knex);

  export default knex;
