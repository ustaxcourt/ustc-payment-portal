import { authorizeClient } from "./authorizeClient";
import { ForbiddenError } from "./errors/forbidden";
import {
  getClientByRoleArn,
  ClientPermission,
} from "./clients/permissionsClient";

jest.mock("./clients/permissionsClient");

const mockGetClientByRoleArn = getClientByRoleArn as jest.MockedFunction<
  typeof getClientByRoleArn
>;

const dawsonClient: ClientPermission = {
  clientName: "DAWSON",
  clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
  allowedFeeIds: ["PETITION_FILING_FEE"],
};

const nonattorneyClient: ClientPermission = {
  clientName: "Nonattorney Exam App",
  clientRoleArn: "arn:aws:iam::999999999999:role/nonattorney-client",
  allowedFeeIds: ["NONATTORNEY_EXAM_REGISTRATION_FEE"],
};

const localDevClient: ClientPermission = {
  clientName: "Local Development",
  clientRoleArn: "arn:aws:iam::000000000000:role/local-dev-role",
  allowedFeeIds: ["*"],
};

describe("authorizeClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with no feeId (read-only endpoint)", () => {
    it("returns the client when feeId is omitted — only registration check applies", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn)
      ).resolves.toEqual(dawsonClient);
    });

    it("throws when client is unregistered even without a feeId", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(null);

      await expect(
        authorizeClient("arn:aws:iam::111111111111:role/unknown")
      ).rejects.toThrow("Client not registered");
    });
  });

  describe("with valid client and feeId", () => {
    it("returns the client when client is authorized for the feeId", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "PETITION_FILING_FEE")
      ).resolves.toEqual(dawsonClient);
    });

    it("returns the client when client has wildcard permission", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(localDevClient);

      await expect(
        authorizeClient(localDevClient.clientRoleArn, "ANY_FEE_ID")
      ).resolves.toEqual(localDevClient);
    });
  });

  describe("with unregistered client", () => {
    it("throws ForbiddenError with 'Client not registered' message", async () => {
      mockGetClientByRoleArn.mockResolvedValue(null);

      await expect(
        authorizeClient("arn:aws:iam::111111111111:role/unknown", "SOME_FEE")
      ).rejects.toThrow(ForbiddenError);

      await expect(
        authorizeClient("arn:aws:iam::111111111111:role/unknown", "SOME_FEE")
      ).rejects.toThrow("Client not registered");
    });
  });

  describe("DAWSON fee authorization", () => {
    it("allows DAWSON to charge PETITION_FILING_FEE and returns client", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "PETITION_FILING_FEE")
      ).resolves.toEqual(dawsonClient);
    });

    it("prevents DAWSON from charging NONATTORNEY_EXAM_REGISTRATION_FEE", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "NONATTORNEY_EXAM_REGISTRATION_FEE")
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Nonattorney fee authorization", () => {
    it("allows Nonattorney App to charge NONATTORNEY_EXAM_REGISTRATION_FEE and returns client", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(nonattorneyClient);

      await expect(
        authorizeClient(nonattorneyClient.clientRoleArn, "NONATTORNEY_EXAM_REGISTRATION_FEE")
      ).resolves.toEqual(nonattorneyClient);
    });

    it("prevents Nonattorney App from charging PETITION_FILING_FEE", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(nonattorneyClient);

      await expect(
        authorizeClient(nonattorneyClient.clientRoleArn, "PETITION_FILING_FEE")
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("with unauthorized feeId", () => {
    it("throws ForbiddenError with 'Client not authorized for feeId' message", async () => {
      mockGetClientByRoleArn.mockResolvedValue(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "UNAUTHORIZED_FEE")
      ).rejects.toThrow(ForbiddenError);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "UNAUTHORIZED_FEE")
      ).rejects.toThrow("Client not authorized for feeId");
    });

    it("throws for feeId that is similar but not exact match (case sensitive)", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      // lowercase should fail - case sensitive matching
      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "petition_filing_fee")
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws for completely unrelated feeId", async () => {
      mockGetClientByRoleArn.mockResolvedValueOnce(dawsonClient);

      await expect(
        authorizeClient(dawsonClient.clientRoleArn, "TRANSCRIPT_GROUP_COPY_FEE")
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
