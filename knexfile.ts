import type { Knex } from 'knex';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USER = 'user',
  DB_PASSWORD = 'password',
  DB_NAME = 'mydb',
  NODE_ENV = 'development',
} = process.env;

const common: Knex.Config = {
  client: 'pg', // or 'mysql2' | 'better-sqlite3' etc.
  migrations: {
    tableName: 'knex_migrations',
    directory: './db/migrations',
    extension: 'ts'
  },
  seeds: {
    directory: './db/seeds',
    extension: 'ts'
  },
  pool: { min: 2, max: 10 }
};

const config: { [key: string]: Knex.Config } = {
  development: {
    ...common,
    connection: {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    }
  },
  test: {
    ...common,
    connection: {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: `${DB_NAME}_test`
    }
  },
  production: {
    ...common,
    connection: process.env.DATABASE_URL || {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    }
  }
};

export default config;
