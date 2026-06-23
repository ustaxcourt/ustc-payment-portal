import { authorizeClient } from "./authorizeClient";
import { ForbiddenError } from "errors/forbidden";
import { ClientPermission } from "types/ClientPermission";

const dawsonClient: ClientPermission = {
  clientName: "DAWSON",
  clientRoleArn: "arn:aws:iam::123456789012:role/dawson-client",
  allowedFeeKeys: ["PETITION_FILING_FEE"],
};

const nonattorneyClient: ClientPermission = {
  clientName: "Nonattorney Exam App",
  clientRoleArn: "arn:aws:iam::999999999999:role/nonattorney-client",
  allowedFeeKeys: ["NONATTORNEY_EXAM_REGISTRATION_FEE"],
};

const localDevClient: ClientPermission = {
  clientName: "Local Development",
  clientRoleArn: "arn:aws:iam::000000000000:role/local-dev-role",
  allowedFeeKeys: ["*"],
};

describe("authorizeClient", () => {
  describe("with valid client and feeId", () => {
    it("returns true when client is authorized for the feeId", () => {
      expect(authorizeClient(dawsonClient, "PETITION_FILING_FEE")).toBe(true);
    });

    it("returns true when client has wildcard permission", () => {
      expect(authorizeClient(localDevClient, "ANY_FEE_ID")).toBe(true);
    });
  });

  describe("DAWSON fee authorization", () => {
    it("allows DAWSON to charge PETITION_FILING_FEE", () => {
      expect(authorizeClient(dawsonClient, "PETITION_FILING_FEE")).toBe(true);
    });

    it("prevents DAWSON from charging NONATTORNEY_EXAM_REGISTRATION_FEE", () => {
      expect(() =>
        authorizeClient(dawsonClient, "NONATTORNEY_EXAM_REGISTRATION_FEE"),
      ).toThrow(ForbiddenError);
    });
  });

  describe("Nonattorney fee authorization", () => {
    it("allows Nonattorney App to charge NONATTORNEY_EXAM_REGISTRATION_FEE", () => {
      expect(
        authorizeClient(nonattorneyClient, "NONATTORNEY_EXAM_REGISTRATION_FEE"),
      ).toBe(true);
    });

    it("prevents Nonattorney App from charging PETITION_FILING_FEE", () => {
      expect(() =>
        authorizeClient(nonattorneyClient, "PETITION_FILING_FEE"),
      ).toThrow(ForbiddenError);
    });
  });

  describe("with unauthorized feeId", () => {
    it("throws ForbiddenError with 'Client not authorized for fee' message", () => {
      expect(() => authorizeClient(dawsonClient, "UNAUTHORIZED_FEE")).toThrow(
        ForbiddenError,
      );

      expect(() => authorizeClient(dawsonClient, "UNAUTHORIZED_FEE")).toThrow(
        "Client not authorized for fee",
      );
    });

    it("throws for feeId that is similar but not exact match (case sensitive)", () => {
      // lowercase should fail - case sensitive matching
      expect(() =>
        authorizeClient(dawsonClient, "petition_filing_fee"),
      ).toThrow(ForbiddenError);
    });

    it("throws for completely unrelated feeId", () => {
      expect(() =>
        authorizeClient(dawsonClient, "TRANSCRIPT_GROUP_COPY_FEE"),
      ).toThrow(ForbiddenError);
    });
  });
});
