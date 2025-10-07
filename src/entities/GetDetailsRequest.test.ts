import { GetRequestRequest } from "./GetDetailsRequest";
import { SoapRequest } from "./SoapRequest";
import { testAppContext as appContext } from "../test/testAppContext";

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
            <transaction_type>Sale</transaction_type>
            <transaction_date>2025-10-07T10:54:05</transaction_date>
            <payment_date>2025-10-07</payment_date>
            <transaction_status>Success</transaction_status>
            <payment_type>PLASTIC_CARD</payment_type>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("GetRequestRequest", () => {
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
      appContext.postHttpRequest = jest.fn().mockImplementation(async () => {
        return Promise.resolve(mockResponseSingleTransaction);
      });

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      // Mock the parsed response to have an array structure
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: {
            transactions: [
              {
                transaction: {
                  paygov_tracking_id: mockPayGovTrackingId,
                  agency_tracking_id: "agency-tracking-token",
                  transaction_amount: "150.00",
                  transaction_status: "Success",
                },
              },
            ],
          },
        },
      });

      const result = await request.makeSoapRequest(appContext);

      expect(result.paygov_tracking_id).toBe(mockPayGovTrackingId);
      expect(result.transaction_status).toBe("Success");

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });

    it("throws error when no transaction details found", async () => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue("");

      const request = new GetRequestRequest({
        tcsAppId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      // Mock the parsed response to have an empty array
      const originalMakeRequest = SoapRequest.prototype.makeRequest;
      SoapRequest.prototype.makeRequest = jest.fn().mockResolvedValue({
        "ns2:getDetailsResponse": {
          getDetailsResponse: {
            transactions: [],
          },
        },
      });

      await expect(request.makeSoapRequest(appContext)).rejects.toThrow(
        "Could not find any transaction details"
      );

      // Restore original
      SoapRequest.prototype.makeRequest = originalMakeRequest;
    });
  });
});
