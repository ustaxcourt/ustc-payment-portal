import Knex from 'knex';
import { Model, knexSnakeCaseMappers } from 'objection';
import knexConfig from '../knexfile';

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

if (!config) {
  throw new Error(`No Knex configuration found for environment: ${environment}`);
}

const connectionConfig = config.connection as any;
console.log(`[Knex] Connecting to database: ${connectionConfig?.database || 'unknown'}`);
console.log(`[Knex] Host: ${connectionConfig?.host || 'unknown'}:${connectionConfig?.port || 'unknown'}`);

const knex = Knex({
  ...config,
  ...knexSnakeCaseMappers(),
});

// Test the connection
knex.raw('SELECT 1')
  .then(() => {
    console.log('[Knex] Database connection established successfully');
  })
  .catch((err) => {
    console.error('[Knex] Database connection failed:', err.message);
  });

// Initialize Objection with Knex
Model.knex(knex);

export default knex;
