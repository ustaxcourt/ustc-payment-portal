jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn(),
}));

jest.mock("knex", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("./db/getRdsCredentials", () => ({
  parseRdsEndpoint: jest.fn((endpoint: string) => {
    const colonIdx = endpoint.lastIndexOf(":");
    return {
      host: endpoint.slice(0, colonIdx),
      port: parseInt(endpoint.slice(colonIdx + 1), 10),
    };
  }),
}));

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import Knex from "knex";
import { migrationHandler } from "./migrationHandler";

const mockKnex = Knex as unknown as jest.Mock;
const mockSecretsManagerClient = SecretsManagerClient as unknown as jest.Mock;
const mockGetSecretValueCommand = GetSecretValueCommand as unknown as jest.Mock;

const RDS_SECRET = JSON.stringify({
  username: "db_user",
  password: "db_password",
});
const MASTER_SECRET = JSON.stringify({
  username: "master_user",
  password: "master_password",
});

describe("migrationHandler", () => {
  let mockSend: jest.Mock;
  let mockLatest: jest.Mock;
  let mockCurrentVersion: jest.Mock;
  let mockSeedRun: jest.Mock;
  let mockRaw: jest.Mock;
  let mockDestroy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.RDS_SECRET_ARN =
      "arn:aws:secretsmanager:us-east-1:123:secret:rds";
    process.env.RDS_MASTER_SECRET_ARN =
      "arn:aws:secretsmanager:us-east-1:123:secret:rds-master";
    process.env.RDS_ENDPOINT = "db.example.us-east-1.rds.amazonaws.com:5432";
    process.env.RDS_DB_NAME = "paymentportal_pr_99";
    process.env.DB_HOST = "localhost";
    process.env.DB_PORT = "5433";
    process.env.DB_USER = "local_user";
    process.env.DB_PASSWORD = "local_password";
    process.env.DB_NAME = "mydb";

    mockSend = jest.fn().mockResolvedValue({ SecretString: RDS_SECRET });
    mockLatest = jest.fn().mockResolvedValue([3, []]);
    mockCurrentVersion = jest.fn().mockResolvedValue("20260305195503_init_db");
    mockSeedRun = jest.fn().mockResolvedValue(undefined);
    mockRaw = jest.fn();
    mockDestroy = jest.fn().mockResolvedValue(undefined);

    mockSecretsManagerClient.mockImplementation(() => ({ send: mockSend }));
    mockGetSecretValueCommand.mockImplementation(
      (input: { SecretId: string }) => input,
    );
    mockKnex.mockReturnValue({
      migrate: { latest: mockLatest, currentVersion: mockCurrentVersion },
      seed: { run: mockSeedRun },
      raw: mockRaw,
      destroy: mockDestroy,
    });
  });

  afterEach(() => {
    delete process.env.RDS_SECRET_ARN;
    delete process.env.RDS_MASTER_SECRET_ARN;
    delete process.env.RDS_ENDPOINT;
    delete process.env.RDS_DB_NAME;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
  });

  it("reads credentials from Secrets Manager and runs knex migrate.latest", async () => {
    const result = await migrationHandler();

    expect(mockSend).toHaveBeenCalledWith({
      SecretId: process.env.RDS_SECRET_ARN,
    });
    expect(mockKnex).toHaveBeenCalledWith(
      expect.objectContaining({
        client: "pg",
        connection: expect.objectContaining({
          host: "db.example.us-east-1.rds.amazonaws.com",
          port: 5432,
          user: "db_user",
          password: "db_password",
          database: "paymentportal_pr_99",
        }),
        pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 },
        migrations: expect.objectContaining({
          directory: expect.stringContaining("db/migrations"),
        }),
      }),
    );
    expect(mockLatest).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ batchNo: 3, migrations: [] }),
    });
  });

  it("destroys the knex connection when migrate.latest throws", async () => {
    mockLatest.mockRejectedValueOnce(new Error("migration failed"));

    await expect(migrationHandler()).rejects.toThrow("migration failed");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("throws when only RDS_SECRET_ARN is set without RDS_ENDPOINT", async () => {
    delete process.env.RDS_ENDPOINT;

    await expect(migrationHandler()).rejects.toThrow(
      "RDS_SECRET_ARN and RDS_ENDPOINT must both be set or both be unset",
    );
    expect(mockLatest).not.toHaveBeenCalled();
  });

  it("throws when only RDS_ENDPOINT is set without RDS_SECRET_ARN", async () => {
    delete process.env.RDS_SECRET_ARN;

    await expect(migrationHandler()).rejects.toThrow(
      "RDS_SECRET_ARN and RDS_ENDPOINT must both be set or both be unset",
    );
    expect(mockLatest).not.toHaveBeenCalled();
  });

  it("uses local DB env vars when RDS env vars are not set", async () => {
    delete process.env.RDS_SECRET_ARN;
    delete process.env.RDS_ENDPOINT;

    const result = await migrationHandler();

    expect(mockSecretsManagerClient).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockKnex).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({
          host: "localhost",
          port: 5433,
          user: "local_user",
          password: "local_password",
          database: "mydb",
        }),
      }),
    );
    expect(result.statusCode).toBe(200);
  });

  it("verify returns the current migration version", async () => {
    const result = await migrationHandler({ command: "verify" });

    expect(mockCurrentVersion).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ version: "20260305195503_init_db" }),
    });
  });

  it("seed runs seed files and returns success", async () => {
    const result = await migrationHandler({ command: "seed" });

    expect(mockSeedRun).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: "Seeds completed" }),
    });
  });

  it("create-db creates the database when it does not exist", async () => {
    mockSend.mockResolvedValue({ SecretString: MASTER_SECRET });
    mockRaw
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce(undefined);

    const result = await migrationHandler({ command: "create-db" });

    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("pg_database"),
      ["paymentportal_pr_99"],
    );
    expect(mockRaw).toHaveBeenCalledWith("CREATE DATABASE ??", [
      "paymentportal_pr_99",
    ]);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });

  it("create-db skips creation when database already exists", async () => {
    mockSend.mockResolvedValue({ SecretString: MASTER_SECRET });
    mockRaw.mockResolvedValueOnce({ rows: [{ exists: true }] });

    const result = await migrationHandler({ command: "create-db" });

    expect(mockRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({
        message: `Database "paymentportal_pr_99" already exists`,
      }),
    });
  });

  it("create-db throws when RDS_MASTER_SECRET_ARN is not set", async () => {
    delete process.env.RDS_MASTER_SECRET_ARN;

    await expect(migrationHandler({ command: "create-db" })).rejects.toThrow(
      "RDS_MASTER_SECRET_ARN is not set",
    );
  });

  it("create-db throws when RDS_DB_NAME is not set", async () => {
    delete process.env.RDS_DB_NAME;

    await expect(migrationHandler({ command: "create-db" })).rejects.toThrow(
      "RDS_DB_NAME is not set",
    );
  });

  it("drop-db drops the database", async () => {
    mockSend.mockResolvedValue({ SecretString: MASTER_SECRET });
    mockRaw.mockResolvedValueOnce(undefined);

    const result = await migrationHandler({ command: "drop-db" });

    expect(mockRaw).toHaveBeenCalledWith(
      "DROP DATABASE IF EXISTS ?? WITH (FORCE)",
      ["paymentportal_pr_99"],
    );
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
  });

  it("drop-db throws when RDS_MASTER_SECRET_ARN is not set", async () => {
    delete process.env.RDS_MASTER_SECRET_ARN;

    await expect(migrationHandler({ command: "drop-db" })).rejects.toThrow(
      "RDS_MASTER_SECRET_ARN is not set",
    );
  });

  it("drop-db refuses to drop a non-PR database", async () => {
    process.env.RDS_DB_NAME = "paymentportal";

    await expect(migrationHandler({ command: "drop-db" })).rejects.toThrow(
      'Refusing to drop "paymentportal"',
    );
    expect(mockRaw).not.toHaveBeenCalled();
  });

  describe("gc-dbs", () => {
    beforeEach(() => {
      mockSend.mockResolvedValue({ SecretString: MASTER_SECRET });
    });

    it("throws when openPrNumbers is not provided", async () => {
      await expect(migrationHandler({ command: "gc-dbs" })).rejects.toThrow(
        "gc-dbs requires a non-empty openPrNumbers array",
      );
      expect(mockRaw).not.toHaveBeenCalled();
    });

    it("throws when openPrNumbers is an empty array", async () => {
      await expect(
        migrationHandler({ command: "gc-dbs", openPrNumbers: [] }),
      ).rejects.toThrow("gc-dbs requires a non-empty openPrNumbers array");
      expect(mockRaw).not.toHaveBeenCalled();
    });

    it("drops databases for closed PRs and keeps open ones", async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { datname: "paymentportal_pr_10" },
          { datname: "paymentportal_pr_20" },
          { datname: "paymentportal_pr_30" },
        ],
      });
      mockRaw.mockResolvedValue(undefined);

      const result = await migrationHandler({
        command: "gc-dbs",
        openPrNumbers: [20],
      });

      // pr_10 and pr_30 are closed — should be dropped
      expect(mockRaw).toHaveBeenCalledWith(
        "DROP DATABASE IF EXISTS ?? WITH (FORCE)",
        ["paymentportal_pr_10"],
      );
      expect(mockRaw).toHaveBeenCalledWith(
        "DROP DATABASE IF EXISTS ?? WITH (FORCE)",
        ["paymentportal_pr_30"],
      );
      // pr_20 is open — must NOT be dropped
      expect(mockRaw).not.toHaveBeenCalledWith(
        "DROP DATABASE IF EXISTS ?? WITH (FORCE)",
        ["paymentportal_pr_20"],
      );
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          dropped: ["paymentportal_pr_10", "paymentportal_pr_30"],
        }),
      });
    });

    it("drops nothing when all PR databases are still open", async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { datname: "paymentportal_pr_10" },
          { datname: "paymentportal_pr_20" },
        ],
      });

      const result = await migrationHandler({
        command: "gc-dbs",
        openPrNumbers: [10, 20],
      });

      expect(mockRaw).toHaveBeenCalledTimes(1); // only the SELECT
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ dropped: [] }),
      });
    });

    it("skips database names that do not match the expected pattern", async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { datname: "paymentportal_pr_10" },
          { datname: "paymentportal_pr_unexpected_name" },
        ],
      });
      mockRaw.mockResolvedValue(undefined);

      const result = await migrationHandler({
        command: "gc-dbs",
        openPrNumbers: [99],
      });

      // pr_10 dropped (not in open list), unexpected_name skipped
      expect(mockRaw).toHaveBeenCalledWith(
        "DROP DATABASE IF EXISTS ?? WITH (FORCE)",
        ["paymentportal_pr_10"],
      );
      expect(mockRaw).not.toHaveBeenCalledWith(
        expect.anything(),
        ["paymentportal_pr_unexpected_name"],
      );
      expect(result).toEqual({
        statusCode: 200,
        body: JSON.stringify({ dropped: ["paymentportal_pr_10"] }),
      });
    });

    it("destroys the knex connection even when a drop fails", async () => {
      mockRaw
        .mockResolvedValueOnce({
          rows: [{ datname: "paymentportal_pr_10" }],
        })
        .mockRejectedValueOnce(new Error("drop failed"));

      await expect(
        migrationHandler({ command: "gc-dbs", openPrNumbers: [99] }),
      ).rejects.toThrow("drop failed");
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });
});
