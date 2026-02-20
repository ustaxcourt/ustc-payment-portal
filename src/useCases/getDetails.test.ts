import { getDetails } from "./getDetails";
import { testAppContext as appContext } from "../test/testAppContext";

const mockPayGovTrackingId = "test-tracking-id-12345";

const mockSuccessResponse = `<?xml version="1.0" encoding="UTF-8"?>
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
            <transaction_status>Success</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockPendingResponse = `<?xml version="1.0" encoding="UTF-8"?>
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
            <transaction_status>Received</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("getDetails", () => {
  it("throws an error if we pass in an invalid request", async () => {
    await expect(
      getDetails(appContext, {
        foo: "bar",
      } as any),
    ).rejects.toThrow();
  });

  describe("Successfully retrieved transaction details", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessResponse);
    });

    it("returns the trackingId from the XML", async () => {
      const { trackingId } = await getDetails(appContext, {
        appId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      expect(trackingId).toEqual(mockPayGovTrackingId);
    });

    it("returns the transactionStatus from the XML", async () => {
      const { transactionStatus } = await getDetails(appContext, {
        appId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      expect(transactionStatus).toEqual("Success");
    });
  });

  describe("Pending transaction details", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    it("returns the trackingId", async () => {
      const { trackingId } = await getDetails(appContext, {
        appId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      expect(trackingId).toBe(mockPayGovTrackingId);
    });

    it("returns Pending transaction status", async () => {
      const { transactionStatus } = await getDetails(appContext, {
        appId: "test-app-id",
        payGovTrackingId: mockPayGovTrackingId,
      });

      expect(transactionStatus).toBe("Pending");
    });
  });
});
