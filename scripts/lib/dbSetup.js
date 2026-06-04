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
  // DB_PORT is the only connection setting consumers can override via .env.payment-portal.
  // All other values are fixed — reading them from process.env would let a consumer's
  // shell environment silently break the local stack.
  const port = Number(process.env.DB_PORT || "5433");

  const knex = Knex({
    client: "pg",
    connection: {
      host: "localhost",
      port,
      user: "user",
      password: "password",
      database: "mydb",
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
