jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn(),
}));

jest.mock("knex", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import Knex from "knex";
import { migrationHandler } from "./migrationHandler";

const mockKnex = Knex as unknown as jest.Mock;
const mockSecretsManagerClient = SecretsManagerClient as unknown as jest.Mock;
const mockGetSecretValueCommand = GetSecretValueCommand as unknown as jest.Mock;

describe("migrationHandler", () => {
  let mockSend: jest.Mock;
  let mockLatest: jest.Mock;
  let mockDestroy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.RDS_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds";
    process.env.RDS_ENDPOINT = "db.example.us-east-1.rds.amazonaws.com:5432";

    mockSend = jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        username: "db_user",
        password: "db_password",
      }),
    });
    mockLatest = jest.fn().mockResolvedValue([3, []]);
    mockDestroy = jest.fn().mockResolvedValue(undefined);

    mockSecretsManagerClient.mockImplementation(() => ({
      send: mockSend,
    }));
    mockGetSecretValueCommand.mockImplementation((input: { SecretId: string }) => input);
    mockKnex.mockReturnValue({
      migrate: {
        latest: mockLatest,
      },
      destroy: mockDestroy,
    });
  });

  afterEach(() => {
    delete process.env.RDS_SECRET_ARN;
    delete process.env.RDS_ENDPOINT;
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
          database: "paymentportal",
        }),
        pool: {
          min: 0,
          max: 1,
        },
        migrations: expect.objectContaining({
          directory: expect.stringContaining("db/migrations"),
        }),
      }),
    );
    expect(mockLatest).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({
        batchNo: 3,
        migrations: [],
      }),
    });
  });

  it("destroys the knex connection when migrate.latest throws", async () => {
    mockLatest.mockRejectedValueOnce(new Error("migration failed"));

    await expect(migrationHandler()).rejects.toThrow("migration failed");
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
