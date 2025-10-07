import { CompleteOnlineCollectionWithDetailsRequest } from "./CompleteOnlineCollectionWithDetailsRequest";
import { SoapRequest } from "./SoapRequest";
import { testAppContext as appContext } from "../test/testAppContext";
import { FailedTransactionError } from "../errors/failedTransaction";

const mockToken = "test-token-12345";
const mockPayGovTrackingId = "test-tracking-id-12345";

const mockSuccessResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
        <transaction_status>Success</transaction_status>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
        <transaction_amount>150.00</transaction_amount>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("CompleteOnlineCollectionWithDetailsRequest", () => {
  it("constructs correctly with required parameters", () => {
    const request = new CompleteOnlineCollectionWithDetailsRequest({
      tcsAppId: "test-app-id",
      token: mockToken,
    });

    expect(request).toBeDefined();
    expect(request.token).toBe(mockToken);
  });

  describe("makeSoapRequest", () => {
    it("returns transaction details for successful response", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessResponse);

      const request = new CompleteOnlineCollectionWithDetailsRequest({
        tcsAppId: "test-app-id",
        token: mockToken,
      });

      const result = await request.makeSoapRequest(appContext);

      expect(result.paygov_tracking_id).toBe(mockPayGovTrackingId);
      expect(result.transaction_status).toBe("Success");
      expect(result.agency_tracking_id).toBe("agency-tracking-token");
      expect(result.transaction_amount).toBe(150);
    });

    it("throws FailedTransactionError when fault is undefined", async () => {
      const request = new CompleteOnlineCollectionWithDetailsRequest({
        tcsAppId: "test-app-id",
        token: mockToken,
      });

      // Mock makeRequest to return a response without success or fault
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "S:Fault": undefined,
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toThrow(
        FailedTransactionError
      );

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });

    it("throws FailedTransactionError when fault has no detail", async () => {
      const request = new CompleteOnlineCollectionWithDetailsRequest({
        tcsAppId: "test-app-id",
        token: mockToken,
      });

      // Mock makeRequest to return a fault without detail
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "S:Fault": {
          faultcode: "S:Server",
          faultstring: "Internal error",
        },
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toThrow(
        FailedTransactionError
      );

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });

    it("throws FailedTransactionError when fault has no TCSServiceFault", async () => {
      const request = new CompleteOnlineCollectionWithDetailsRequest({
        tcsAppId: "test-app-id",
        token: mockToken,
      });

      // Mock makeRequest to return a fault without TCSServiceFault
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "S:Fault": {
          faultcode: "S:Server",
          faultstring: "Internal error",
          detail: {},
        },
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toThrow(
        FailedTransactionError
      );

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });

    it("throws FailedTransactionError with details when fault has TCSServiceFault", async () => {
      const request = new CompleteOnlineCollectionWithDetailsRequest({
        tcsAppId: "test-app-id",
        token: mockToken,
      });

      // Mock makeRequest to return a complete fault
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "S:Fault": {
          faultcode: "S:Server",
          faultstring: "Service fault",
          detail: {
            "ns2:TCSServiceFault": {
              return_code: "1001",
              return_detail: "Invalid token provided",
            },
          },
        },
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toThrow(
        new FailedTransactionError("Invalid token provided", 1001)
      );

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });
  });
});
