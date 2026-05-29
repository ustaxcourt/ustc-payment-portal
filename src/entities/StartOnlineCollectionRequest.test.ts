import { ZodError } from "zod";
import { StartOnlineCollectionRequest } from "./StartOnlineCollectionRequest";
import { SoapRequest } from "./SoapRequest";
import { testAppContext as appContext } from "../test/testAppContext";
import { FailedTransactionError } from "../errors/failedTransaction";

const validToken = crypto.randomUUID().replace(/-/g, "");

const baseRequest = {
  tcsAppId: "test-app-id",
  agencyTrackingId: "agency-tracking-token",
  transactionAmount: 150,
  urlCancel: "https://example.com/cancel",
  urlSuccess: "https://example.com/success",
};

const mockSuccessXml = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:startOnlineCollectionResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <startOnlineCollectionResponse>
        <token>${validToken}</token>
      </startOnlineCollectionResponse>
    </ns2:startOnlineCollectionResponse>
  </S:Body>
</S:Envelope>
`;

describe("StartOnlineCollectionRequest", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("constructs correctly with required parameters", () => {
    const request = new StartOnlineCollectionRequest(baseRequest);

    expect(request).toBeDefined();
    expect(request.agencyTrackingId).toBe(baseRequest.agencyTrackingId);
    expect(request.transactionAmount).toBe("150.00");
    expect(request.urlCancel).toBe(baseRequest.urlCancel);
    expect(request.urlSuccess).toBe(baseRequest.urlSuccess);
  });

  describe("makeSoapRequest", () => {
    it("returns the token for a valid Pay.gov response", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessXml);

      const request = new StartOnlineCollectionRequest(baseRequest);
      const result = await request.makeSoapRequest(appContext);

      expect(result.token).toBe(validToken);
    });

    it("throws a ZodError when Pay.gov returns an empty token", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:startOnlineCollectionResponse": {
          startOnlineCollectionResponse: { token: "" },
        },
      });

      const request = new StartOnlineCollectionRequest(baseRequest);

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("throws a ZodError when Pay.gov returns a response missing the token field", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:startOnlineCollectionResponse": {
          startOnlineCollectionResponse: {},
        },
      });

      const request = new StartOnlineCollectionRequest(baseRequest);

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("throws a ZodError when Pay.gov returns a token of the wrong length", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:startOnlineCollectionResponse": {
          startOnlineCollectionResponse: { token: validToken.slice(0, 31) },
        },
      });

      const request = new StartOnlineCollectionRequest(baseRequest);

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("logs Zod issues and token length without leaking the raw token value", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(jest.fn());
      // 31 chars — fails `.length(32)` but is long enough to represent a real
      // credential we must not write to logs.
      const sensitiveToken = "SENSITIVE_TOKEN_DO_NOT_LEAK_3CH";
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:startOnlineCollectionResponse": {
          startOnlineCollectionResponse: { token: sensitiveToken },
        },
      });

      const request = new StartOnlineCollectionRequest(baseRequest);

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );

      const loggedPayload = consoleErrorSpy.mock.calls[0][1];
      expect(consoleErrorSpy.mock.calls[0][0]).toBe(
        "startOnlineCollection schema validation failed",
      );
      expect(loggedPayload).toContain("errors");
      expect(loggedPayload).toContain('"tokenLength":31');
      expect(loggedPayload).not.toContain(sensitiveToken);
    });

    it("throws FailedTransactionError when the SOAP envelope is missing the ns2:startOnlineCollectionResponse key", async () => {
      // Empty envelope: no success key and no S:Fault → handleFault(undefined) path.
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({});

      const request = new StartOnlineCollectionRequest(baseRequest);

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        FailedTransactionError,
      );
    });

    it("throws FailedTransactionError when the envelope has no success response and carries an S:Fault", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "S:Fault": {
          faultcode: "S:Server",
          faultstring: "TCSServiceFault",
          detail: {
            "ns2:TCSServiceFault": {
              return_code: "5009",
              return_detail: "Existing token for this agency tracking id",
            },
          },
        },
      });

      const request = new StartOnlineCollectionRequest(baseRequest);

      const promise = request.makeSoapRequest(appContext);
      await expect(promise).rejects.toBeInstanceOf(FailedTransactionError);
      await expect(promise).rejects.toMatchObject({
        message: "Existing token for this agency tracking id",
        code: 5009,
      });
    });
  });

  describe("handleFault", () => {
    const request = new StartOnlineCollectionRequest(baseRequest);

    it("returns a FailedTransactionError when fault is undefined", () => {
      const result = request.handleFault(undefined);
      expect(result).toBeInstanceOf(FailedTransactionError);
      expect(result.message).toBe(
        "Unexpected response from Pay.gov: no fault detail returned",
      );
    });

    it("returns a FailedTransactionError when fault has no detail", () => {
      const result = request.handleFault({
        faultcode: "soap:Server",
        faultstring: "boom",
      });
      expect(result).toBeInstanceOf(FailedTransactionError);
      expect(result.message).toBe(
        "Pay.gov returned a fault without error details",
      );
    });

    it("carries return_code and return_detail when fault is fully populated", () => {
      const result = request.handleFault({
        faultcode: "soap:Server",
        faultstring: "TCS fault",
        detail: {
          "ns2:TCSServiceFault": {
            return_code: "42",
            return_detail: "Transaction not found",
          },
        },
      });
      expect(result).toBeInstanceOf(FailedTransactionError);
      expect(result.message).toBe("Transaction not found");
      expect(result.code).toBe(42);
    });
  });
});
