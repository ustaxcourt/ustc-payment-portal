import Knex from 'knex';
import { Model } from 'objection';
import { getKnexConfigForEnv } from './knexConfig';

const NODE_ENV = process.env.NODE_ENV || 'development';
const knexConfig = getKnexConfigForEnv(NODE_ENV);

if (NODE_ENV !== 'production') {
  const connection = knexConfig.connection;
  const dbName =
    typeof connection === 'string'
      ? '(DATABASE_URL)'
      : connection && typeof connection === 'object' && 'database' in connection
        ? String(connection.database)
        : '(unknown)';
  console.log(
    `[Dashboard Knex] env=${NODE_ENV} db=${dbName}`
  );
}

const knex = Knex(knexConfig);

// Bind Objection models to this Knex instance
Model.knex(knex);

export default knex;
