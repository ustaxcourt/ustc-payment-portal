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

    describe("handleFault", () => {
      it("throws FailedTransactionError when fault is undefined", () => {
        const request = new CompleteOnlineCollectionWithDetailsRequest({
          tcsAppId: "test-app-id",
          token: mockToken,
        });

        const result = request.handleFault(undefined);
        expect(result).toBeInstanceOf(FailedTransactionError);
      });

    });
  });
});
