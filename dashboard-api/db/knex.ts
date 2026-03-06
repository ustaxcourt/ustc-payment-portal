import 'dotenv/config';
import Knex from 'knex';
import { Model } from 'objection';
import knexConfig from '../../knexfile';

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

if (!config) {
  throw new Error(`No Knex configuration found for environment: ${environment}`);
}

const knex = Knex(config);

// Initialize Objection with Knex
Model.knex(knex);

export default knex;
