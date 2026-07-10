"use strict";

// Register tsx so that knex can require() .ts migration and seed files at runtime.
require("tsx/cjs");

const Knex = require("knex");
const path = require("node:path");
const { createLogger } = require("./log");

const log = createLogger("db-setup");

const packageRoot = path.join(__dirname, "..", "..");
const migrationsDir = path.join(packageRoot, "db", "migrations");
const seedsDir = path.join(packageRoot, "db", "seeds");

async function setupConsumerDb() {
	const port = Number(process.env.DB_PORT) || 5433;

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
			loadExtensions: [".ts"],
		},
		seeds: {
			directory: seedsDir,
			loadExtensions: [".ts"],
		},
	});

	try {
		log.info("Resetting database schema...");
		await knex.raw("DROP SCHEMA public CASCADE");
		await knex.raw("CREATE SCHEMA public");

		log.info("Running migrations...");
		await knex.migrate.latest();

		log.info("Running seeds...");
		await knex.seed.run({ specific: "01_reference_data.ts" });

		log.info("Database ready.");
	} finally {
		await knex.destroy();
	}
}

module.exports = { setupConsumerDb };
