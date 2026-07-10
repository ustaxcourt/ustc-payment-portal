"use strict";

describe("dbSetup", () => {
	let mockKnexInstance;
	let mockKnexConstructor;
	let mockLog;

	function makeKnexInstance() {
		return {
			raw: jest.fn().mockResolvedValue(undefined),
			migrate: { latest: jest.fn().mockResolvedValue(undefined) },
			seed: { run: jest.fn().mockResolvedValue(undefined) },
			destroy: jest.fn().mockResolvedValue(undefined),
		};
	}

	beforeEach(() => {
		jest.resetModules();

		mockKnexInstance = makeKnexInstance();
		mockKnexConstructor = jest.fn(() => mockKnexInstance);
		mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

		jest.doMock("knex", () => mockKnexConstructor);
		jest.doMock("./log", () => ({ createLogger: () => mockLog }));
	});

	afterEach(() => {
		delete process.env.DB_HOST;
		delete process.env.DB_PORT;
		delete process.env.DB_USER;
		delete process.env.DB_PASSWORD;
		delete process.env.DB_NAME;
		jest.restoreAllMocks();
	});

	it("runs DROP SCHEMA → CREATE SCHEMA → migrate → seed in order", async () => {
		const callOrder = [];
		mockKnexInstance.raw.mockImplementation((sql) => {
			callOrder.push(sql);
			return Promise.resolve();
		});
		mockKnexInstance.migrate.latest.mockImplementation(() => {
			callOrder.push("migrate.latest");
			return Promise.resolve();
		});
		mockKnexInstance.seed.run.mockImplementation(() => {
			callOrder.push("seed.run");
			return Promise.resolve();
		});

		const { setupConsumerDb } = require("./dbSetup");
		await setupConsumerDb();

		expect(callOrder).toEqual([
			"DROP SCHEMA public CASCADE",
			"CREATE SCHEMA public",
			"migrate.latest",
			"seed.run",
		]);
	});

	it("reads DB_PORT from the environment file override set by the package user", async () => {
		process.env.DB_PORT = "5555";

		const { setupConsumerDb } = require("./dbSetup");
		await setupConsumerDb();

		expect(mockKnexConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				connection: {
					host: "localhost",
					port: 5555,
					user: "user",
					password: "password",
					database: "mydb",
				},
			}),
		);
	});

	it("uses fixed default values for all non-port connection settings", async () => {
		// host, user, password, and database are always set by the CLI's DEV_DEFAULTS
		// and cannot be overridden by downstream consumers.
		const { setupConsumerDb } = require("./dbSetup");
		await setupConsumerDb();

		expect(mockKnexConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				connection: {
					host: "localhost",
					port: 5433,
					user: "user",
					password: "password",
					database: "mydb",
				},
			}),
		);
	});

	it("uses fixed default values for non-port env variables, even if the downstream developer sets them", async () => {
		process.env.DB_PORT = "5555";
		process.env.DB_HOST = "some-other-host";
		process.env.DB_USER = "some-other-user";
		process.env.DB_PASSWORD = "some-other-password";
		process.env.DB_NAME = "some-other-db";

		const { setupConsumerDb } = require("./dbSetup");
		await setupConsumerDb();

		expect(mockKnexConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				connection: {
					host: "localhost",
					port: 5555,
					user: "user",
					password: "password",
					database: "mydb",
				},
			}),
		);
	});

	it("runs only the reference data seed", async () => {
		const { setupConsumerDb } = require("./dbSetup");
		await setupConsumerDb();

		expect(mockKnexInstance.seed.run).toHaveBeenCalledWith({
			specific: "01_reference_data.ts",
		});
	});

	it("calls knex.destroy() even if migrate.latest() throws", async () => {
		mockKnexInstance.migrate.latest.mockRejectedValue(
			new Error("migration failed"),
		);

		const { setupConsumerDb } = require("./dbSetup");

		await expect(setupConsumerDb()).rejects.toThrow("migration failed");
		expect(mockKnexInstance.destroy).toHaveBeenCalled();
	});
});
