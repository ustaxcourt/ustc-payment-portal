import { authorizeFeeId } from "./authorizeFeeId";
import { ForbiddenError } from "./errors/forbidden";
import {
  getClientByRoleArn,
  clearPermissionsCache,
  ClientPermission,
} from "./clients/clientPermissionsClient";

jest.mock("./clients/clientPermissionsClient");

const mockGetClientByRoleArn = getClientByRoleArn as jest.MockedFunction<
  typeof getClientByRoleArn
>;

const dawsonClient: ClientPermission = {
  clientName: "DAWSON",
  clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
  allowedFeeIds: ["PETITIONS_FILING_FEE", "ADMISSIONS_FEE"],
};

const localDevClient: ClientPermission = {
  clientName: "Local Development",
  clientRoleArn: "arn:aws:iam::000000000000:role/local-dev-role",
  allowedFeeIds: ["*"],
};

describe("authorizeFeeId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with no feeId (read-only endpoint)", () => {
    it("does not throw when feeId is omitted — only registration check applies", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn)
      ).resolves.not.toThrow();
    });

    it("throws when client is unregistered even without a feeId", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(null);

      await expect(
        authorizeFeeId("arn:aws:iam::111111111111:role/unknown")
      ).rejects.toThrow("Client not registered");
    });
  });

  describe("with valid client and feeId", () => {
    it("does not throw when client is authorized for the feeId", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "PETITIONS_FILING_FEE")
      ).resolves.not.toThrow();
    });

    it("does not throw for any of the allowed feeIds", async () => {
      mockGetClientByRoleArn.mockResolvedValue(dawsonClient);

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "PETITIONS_FILING_FEE")
      ).resolves.not.toThrow();

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "ADMISSIONS_FEE")
      ).resolves.not.toThrow();
    });

    it("does not throw when client has wildcard permission", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(localDevClient);

      await expect(
        authorizeFeeId(localDevClient.clientRoleArn, "ANY_FEE_ID")
      ).resolves.not.toThrow();
    });
  });

  describe("with unregistered client", () => {
    it("throws ForbiddenError with 'Client not registered' message", async () => {
      mockGetClientByRoleArn.mockResolvedValue(null);

      await expect(
        authorizeFeeId("arn:aws:iam::111111111111:role/unknown", "SOME_FEE")
      ).rejects.toThrow(ForbiddenError);

      await expect(
        authorizeFeeId("arn:aws:iam::111111111111:role/unknown", "SOME_FEE")
      ).rejects.toThrow("Client not registered");
    });
  });

  describe("with unauthorized feeId", () => {
    it("throws ForbiddenError with 'Client not authorized for feeId' message", async () => {
      mockGetClientByRoleArn.mockResolvedValue(dawsonClient);

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "UNAUTHORIZED_FEE")
      ).rejects.toThrow(ForbiddenError);

      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "UNAUTHORIZED_FEE")
      ).rejects.toThrow("Client not authorized for feeId");
    });

    it("throws for feeId that is similar but not exact match", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      // Case sensitive
      await expect(
        authorizeFeeId(dawsonClient.clientRoleArn, "petitions_filing_fee")
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
