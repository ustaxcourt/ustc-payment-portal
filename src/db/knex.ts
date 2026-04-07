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
  RDS_ENDPOINT,
  RDS_SECRET_ARN,
} = process.env;

const useRds = Boolean(RDS_ENDPOINT && RDS_SECRET_ARN);

if (NODE_ENV !== 'production') {
  const dbLabel = useRds
    ? `(RDS: ${RDS_ENDPOINT})`
    : NODE_ENV === 'test'
      ? `${DB_NAME}_test`
      : DB_NAME;
  console.log(`[Knex] env=${NODE_ENV} db=${dbLabel}`);
}

// When RDS_ENDPOINT + RDS_SECRET_ARN are present (deployed Lambda), resolve credentials
// from Secrets Manager and connect with SSL. Otherwise use plain env vars for local dev/test.
const knex = Knex({
  client: 'pg',
  connection: useRds
    ? () => getRdsCredentials()
    : {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: NODE_ENV === 'test' ? `${DB_NAME}_test` : DB_NAME,
    },
  pool: { min: 0, max: 10 },
  ...knexSnakeCaseMappers(),
});

// Bind Objection models to this Knex instance
Model.knex(knex);

export default knex;
