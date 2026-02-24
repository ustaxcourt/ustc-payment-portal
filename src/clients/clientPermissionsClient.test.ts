import {
  getClientPermissions,
  getClientByRoleArn,
  clearPermissionsCache,
  ClientPermission,
} from "./clientPermissionsClient";
import { getSecretString } from "./secretsClient";
import { ServerError } from "../errors/serverError";

jest.mock("./secretsClient");

const mockGetSecretString = getSecretString as jest.MockedFunction<typeof getSecretString>;

const validPermissions: ClientPermission[] = [
  {
    clientName: "DAWSON",
    clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
    allowedFeeIds: ["PETITIONS_FILING_FEE", "ADMISSIONS_FEE"],
  },
  {
    clientName: "Test App",
    clientRoleArn: "arn:aws:iam::999888777666:role/test-app",
    allowedFeeIds: ["TEST_FEE"],
  },
];

describe("clientPermissionsClient", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.CLIENT_PERMISSIONS_SECRET_ID = "test-secret-id";
    delete process.env.LOCAL_DEV;
    clearPermissionsCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getClientPermissions", () => {
    it("fetches and returns permissions from Secrets Manager", async () => {
      mockGetSecretString.mockResolvedValueOnce(JSON.stringify(validPermissions));

      const result = await getClientPermissions();

      expect(result).toEqual(validPermissions);
      expect(mockGetSecretString).toHaveBeenCalledWith("test-secret-id");
    });

    it("caches permissions and does not refetch within TTL", async () => {
      mockGetSecretString.mockResolvedValueOnce(JSON.stringify(validPermissions));

      // First call - fetches from Secrets Manager
      await getClientPermissions();
      // Second call - should use cache
      await getClientPermissions();

      expect(mockGetSecretString).toHaveBeenCalledTimes(1);
    });

    it("throws ServerError when CLIENT_PERMISSIONS_SECRET_ID is not set", async () => {
      delete process.env.CLIENT_PERMISSIONS_SECRET_ID;

      await expect(getClientPermissions()).rejects.toThrow(ServerError);
      await expect(getClientPermissions()).rejects.toThrow(
        "CLIENT_PERMISSIONS_SECRET_ID environment variable not set"
      );
    });

    it("throws ServerError when secret value is not valid JSON", async () => {
      mockGetSecretString.mockResolvedValueOnce("not-valid-json");

      await expect(getClientPermissions()).rejects.toThrow(ServerError);
      await expect(getClientPermissions()).rejects.toThrow(
        "Failed to fetch client permissions"
      );
    });

    it("throws ServerError when permissions is not an array", async () => {
      mockGetSecretString.mockResolvedValueOnce(JSON.stringify({ not: "array" }));

      await expect(getClientPermissions()).rejects.toThrow(ServerError);
    });

    it("throws ServerError when permission entry is missing required fields", async () => {
      const invalidPermissions = [{ clientName: "Missing fields" }];
      mockGetSecretString.mockResolvedValueOnce(JSON.stringify(invalidPermissions));

      await expect(getClientPermissions()).rejects.toThrow(ServerError);
    });

    it("throws ServerError when Secrets Manager call fails", async () => {
      mockGetSecretString.mockRejectedValueOnce(new Error("AWS error"));

      await expect(getClientPermissions()).rejects.toThrow(ServerError);
    });

    it("returns mock permissions in local development mode", async () => {
      process.env.LOCAL_DEV = "true";

      const result = await getClientPermissions();

      expect(result).toHaveLength(1);
      expect(result[0].clientName).toBe("Local Development");
      expect(result[0].clientRoleArn).toBe("arn:aws:iam::000000000000:role/local-dev-role");
      expect(mockGetSecretString).not.toHaveBeenCalled();
    });
  });

  describe("getClientByRoleArn", () => {
    beforeEach(() => {
      mockGetSecretString.mockResolvedValue(JSON.stringify(validPermissions));
    });

    it("returns client permission when role ARN matches", async () => {
      const result = await getClientByRoleArn(
        "arn:aws:iam::123456789012:role/dawson-client"
      );

      expect(result).toEqual(validPermissions[0]);
    });

    it("returns null when role ARN does not match any client", async () => {
      const result = await getClientByRoleArn(
        "arn:aws:iam::111111111111:role/unknown-role"
      );

      expect(result).toBeNull();
    });

    it("returns correct client when multiple clients exist", async () => {
      const result = await getClientByRoleArn(
        "arn:aws:iam::999888777666:role/test-app"
      );

      expect(result).toEqual(validPermissions[1]);
      expect(result?.clientName).toBe("Test App");
    });
  });

  describe("clearPermissionsCache", () => {
    it("clears cache forcing refetch on next call", async () => {
      mockGetSecretString.mockResolvedValue(JSON.stringify(validPermissions));

      // First call
      await getClientPermissions();
      expect(mockGetSecretString).toHaveBeenCalledTimes(1);

      // Clear cache
      clearPermissionsCache();

      // Second call should refetch
      await getClientPermissions();
      expect(mockGetSecretString).toHaveBeenCalledTimes(2);
    });
  });
});
