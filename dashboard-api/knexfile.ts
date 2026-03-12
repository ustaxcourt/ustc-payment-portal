import type { Knex } from 'knex';

const {
  DB_HOST = 'localhost',
  DB_PORT = '5433',
  DB_USER = 'user',
  DB_PASSWORD = 'password',
  DB_NAME = 'mydb',
} = process.env;

const common: Knex.Config = {
  client: 'pg',
  migrations: {
    tableName: 'knex_migrations',
    directory: '../db/migrations',
    extension: 'ts'
  },
  seeds: {
    directory: '../db/seeds',
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
    },
    debug: false
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
