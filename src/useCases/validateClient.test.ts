import type { ClientPermission } from "@appTypes/ClientPermission";
import { FeeConfigurationError } from "@errors/feeConfiguration";
import { FeeNotFoundError } from "@errors/feeNotFound";
import { ForbiddenError } from "@errors/forbidden";
import { getActiveFee } from "../config/fees";
import { testAppContext as appContext } from "../test/testAppContext";
import { MISCONFIGURED_FEES_MESSAGE, validateClient } from "./validateClient";

// The real resolver by default, so these tests break if the fee config changes
// shape or a key in `staticFees` is renamed. Individual cases override it only
// where the failure cannot be produced from the real config (a malformed entry,
// or a version that has not activated yet).
jest.mock("../config/fees", () => {
  const actual = jest.requireActual("../config/fees");
  return {
    __esModule: true,
    ...actual,
    getActiveFee: jest.fn(actual.getActiveFee),
  };
});

const getActiveFeeMock = getActiveFee as jest.Mock;

const clientWith = (allowedFeeKeys: string[]): ClientPermission => ({
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeKeys,
});

// `request` is unused by the use case; it exists to satisfy `LambdaHandler<T>`.
const request = {};

describe("validateClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("valid registration", () => {
    it("returns the client name and every registered fee key", async () => {
      const client = clientWith([
        "PETITION_FILING_FEE",
        "NONATTORNEY_EXAM_REGISTRATION_FEE",
      ]);

      await expect(validateClient(appContext, { client, request })).resolves.toEqual(
        {
          clientName: "Test Client",
          allowedFeeKeys: [
            "PETITION_FILING_FEE",
            "NONATTORNEY_EXAM_REGISTRATION_FEE",
          ],
        },
      );
    });

    it("resolves every key, not just the first", async () => {
      const client = clientWith([
        "PETITION_FILING_FEE",
        "NONATTORNEY_EXAM_REGISTRATION_FEE",
      ]);

      await validateClient(appContext, { client, request });

      expect(getActiveFeeMock).toHaveBeenCalledTimes(2);
      expect(getActiveFeeMock).toHaveBeenCalledWith("PETITION_FILING_FEE");
      expect(getActiveFeeMock).toHaveBeenCalledWith(
        "NONATTORNEY_EXAM_REGISTRATION_FEE",
      );
    });

    it("resolves fees as of now rather than pinning a date", async () => {
      await validateClient(appContext, {
        client: clientWith(["PETITION_FILING_FEE"]),
        request,
      });

      expect(getActiveFeeMock).toHaveBeenCalledWith("PETITION_FILING_FEE");
      expect(getActiveFeeMock.mock.calls[0]).toHaveLength(1);
    });
  });

  describe("wildcard permission", () => {
    it("rejects a client registered with only the wildcard", async () => {
      const client = clientWith(["*"]);

      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(MISCONFIGURED_FEES_MESSAGE);
    });

    it("rejects the wildcard even alongside otherwise valid keys", async () => {
      const client = clientWith(["PETITION_FILING_FEE", "*"]);

      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(MISCONFIGURED_FEES_MESSAGE);
    });

    // The wildcard is checked before the resolution loop: `*` is not a fee key,
    // so reaching `getActiveFee` with it would report it as unresolvable and
    // obscure the real problem.
    it("short-circuits before resolving any fee", async () => {
      await expect(
        validateClient(appContext, { client: clientWith(["*"]), request }),
      ).rejects.toThrow(ForbiddenError);

      expect(getActiveFeeMock).not.toHaveBeenCalled();
    });
  });

  describe("empty registration", () => {
    it("rejects a client registered with no fee keys", async () => {
      const client = clientWith([]);

      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(MISCONFIGURED_FEES_MESSAGE);
    });
  });

  describe("unresolvable fee keys", () => {
    it("rejects a key that is not in the fee config", async () => {
      const client = clientWith(["PETITION_FILING_FEE", "NOT_A_REAL_FEE"]);

      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        validateClient(appContext, { client, request }),
      ).rejects.toThrow(MISCONFIGURED_FEES_MESSAGE);
    });

    // A key whose only version has a future `activationDate` produces the same
    // `FeeNotFoundError` as an unknown key. It cannot be provoked from the real
    // config — every version in `staticFees` has already activated — so the
    // throw is staged here.
    it("rejects a key whose only version has not activated yet", async () => {
      getActiveFeeMock.mockImplementationOnce((fee: string) => {
        throw new FeeNotFoundError(fee, "2030-01-01T00:00:00Z");
      });

      await expect(
        validateClient(appContext, {
          client: clientWith(["PETITION_FILING_FEE"]),
          request,
        }),
      ).rejects.toThrow(MISCONFIGURED_FEES_MESSAGE);
    });
  });

  describe("malformed fee config", () => {
    // Our misconfiguration, not the client's: `FeeConfigurationError` carries no
    // `statusCode`, so `handleError` falls through to the generic 500 rather
    // than telling the caller their registration is at fault.
    it("lets a FeeConfigurationError propagate uncaught", async () => {
      getActiveFeeMock.mockImplementationOnce((fee: string) => {
        throw new FeeConfigurationError(fee, "tcsAppId is required");
      });

      await expect(
        validateClient(appContext, {
          client: clientWith(["PETITION_FILING_FEE"]),
          request,
        }),
      ).rejects.toThrow(FeeConfigurationError);
    });
  });
});
