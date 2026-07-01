import { ZodError } from "zod";
import { GetRequestRequest } from "./GetDetailsRequest";
import { SoapRequest } from "./SoapRequest";
import { testAppContext as appContext } from "../test/testAppContext";
import { FailedTransactionError } from "@errors/failedTransaction";

const mockPayGovTrackingId = "test-tracking-id-12345";

const mockResponseSingleTransaction = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <agency_tracking_id>agency-tracking-token</agency_tracking_id>
            <transaction_amount>150.00</transaction_amount>
            <transaction_status>Success</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("GetRequestRequest", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("constructs correctly with required parameters", () => {
    const request = new GetRequestRequest({
      tcsAppId: "test-app-id",
      payGovTrackingId: mockPayGovTrackingId,
    });

    expect(request).toBeDefined();
  });

  describe("makeSoapRequest", () => {
    it("returns transaction details for single transaction response", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockResponseSingleTransaction);

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      const result = await request.makeSoapRequest(appContext);

      expect(result.paygov_tracking_id).toBe(mockPayGovTrackingId);
      expect(result.transaction_status).toBe("Success");
      expect(result.transaction_amount).toBe(150);
    });

    it("returns first transaction details for transaction array response", async () => {
      // Bypassing the XML parser by mocking makeRequest's parsed output directly.
      // fast-xml-parser coerces numeric leaves to numbers, so transaction_amount is a number here.
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: {
            transactions: [
              {
                transaction: {
                  paygov_tracking_id: mockPayGovTrackingId,
                  agency_tracking_id: "agency-tracking-token",
                  transaction_amount: 150,
                  transaction_status: "Success",
                },
              },
            ],
          },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      const result = await request.makeSoapRequest(appContext);

      expect(result.paygov_tracking_id).toBe(mockPayGovTrackingId);
      expect(result.transaction_status).toBe("Success");
    });

    it.each([
      " c8 1p RxKioqGSXbS7fb",
      "HSNCQebgivrFhaTiSUTG ",
      "abc def ghi jkl mnop ",
    ])(
      "preserves whitespace in paygov_tracking_id when parsing the SOAP response (%s)",
      async (idWithWhitespace) => {
        const responseWithWhitespaceId = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${idWithWhitespace}</paygov_tracking_id>
            <agency_tracking_id>agency-tracking-token</agency_tracking_id>
            <transaction_amount>150.00</transaction_amount>
            <transaction_status>Success</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;
        appContext.postHttpRequest = jest
          .fn()
          .mockResolvedValue(responseWithWhitespaceId);

        const request = new GetRequestRequest({
          tcsAppId: "test-app-id",
          payGovTrackingId: idWithWhitespace,
        });

        const result = await request.makeSoapRequest(appContext);

        expect(result.paygov_tracking_id).toBe(idWithWhitespace);
      },
    );

    it("throws a ZodError when Pay.gov returns an empty transactions array", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: { transactions: [] },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("throws a ZodError when Pay.gov returns a response missing required fields", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: {
            transactions: {
              transaction: { paygov_tracking_id: mockPayGovTrackingId },
            },
          },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("throws a ZodError when Pay.gov returns an unrecognized transaction_status", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: {
            transactions: {
              transaction: {
                paygov_tracking_id: mockPayGovTrackingId,
                agency_tracking_id: "agency-tracking-token",
                transaction_amount: 1,
                transaction_status: "Bogus",
              },
            },
          },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
    });

    it("throws FailedTransactionError when the SOAP envelope is missing the ns2:getDetailsResponse key", async () => {
      // Empty envelope: no success response and no S:Fault — handleFault(undefined)
      // path. This is the "Pay.gov returned a malformed/empty envelope" case.
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({});

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        FailedTransactionError,
      );
    });

    it("throws FailedTransactionError when the envelope has no ns2:getDetailsResponse and carries an S:Fault", async () => {
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "S:Fault": {
          faultcode: "S:Server",
          faultstring: "TCSServiceFault",
          detail: {
            "ns2:TCSServiceFault": {
              return_code: "404",
              return_detail: "Transaction not found",
            },
          },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      const promise = request.makeSoapRequest(appContext);
      await expect(promise).rejects.toBeInstanceOf(FailedTransactionError);
      await expect(promise).rejects.toMatchObject({
        message: "Transaction not found",
        code: 404,
      });
    });

    it("logs the raw response and the Zod issues when validation fails", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(jest.fn());
      jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: { transactions: [] },
        },
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
        ZodError,
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "getDetails schema validation failed",
        expect.stringContaining("errors"),
      );
    });

    describe("handleFault", () => {
      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      it("returns a FailedTransactionError when fault is undefined", () => {
        expect(request.handleFault(undefined)).toBeInstanceOf(
          FailedTransactionError,
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
});
