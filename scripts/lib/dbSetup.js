// Programmatic DB setup for consumer mode (CONSUMER_MODE=true).
// Runs a full schema reset followed by migrations and seeds using the
// pre-compiled JS files in dist/db/. Does NOT use ts-node — consumers
// have no devDependencies available.
const Knex = require("knex");
const path = require("node:path");
const { createLogger } = require("./log");

const log = createLogger("db-setup");

// Resolve compiled migration/seed directories relative to this script:
// scripts/lib/ → ../../dist/db/...
const packageRoot = path.join(__dirname, "..", "..");
const migrationsDir = path.join(packageRoot, "dist", "db", "migrations");
const seedsDir = path.join(packageRoot, "dist", "db", "seeds");

async function setupConsumerDb() {
  const {
    DB_HOST = "localhost",
    DB_PORT = "5433",
    DB_USER = "user",
    DB_PASSWORD = "password",
    DB_NAME = "mydb",
  } = process.env;

  const knex = Knex.knex({
    client: "pg",
    connection: {
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: migrationsDir,
      loadExtensions: [".js"],
    },
    seeds: {
      directory: seedsDir,
      loadExtensions: [".js"],
    },
  });

  try {
    log.info("Resetting database schema...");
    await knex.raw("DROP SCHEMA public CASCADE");
    await knex.raw("CREATE SCHEMA public");

    log.info("Running migrations...");
    await knex.migrate.latest();

    log.info("Running seeds...");
    await knex.seed.run({ specific: "01_reference_data.js" });

    log.info("Database ready.");
  } finally {
    await knex.destroy();
  }
}

module.exports = { setupConsumerDb };
