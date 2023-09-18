import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";

const mockPayGovTrackingId = "211d8c91c046404fb159b52d042a12ba";
const mockPendingResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
        <transaction_amount>150.00</transaction_amount>
        <transaction_type>Sale</transaction_type>
        <transaction_date>2023-09-18T10:54:05</transaction_date>
        <payment_date>2023-09-19</payment_date>
        <transaction_status>Received</transaction_status>
        <payment_type>ACH</payment_type>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockSuccessfulResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
        <transaction_amount>150.00</transaction_amount>
        <transaction_type>Sale</transaction_type>
        <transaction_date>2023-09-18T10:54:05</transaction_date>
        <payment_date>2023-09-19</payment_date>
        <transaction_status>Success</transaction_status>
        <payment_type>PLASTIC_CARD</payment_type>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockUnsuccessfulResponse = `<?xml version="1.0" encoding="UTF-8"?>
  <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <S:Fault xmlns:ns4="http://www.w3.org/2003/05/soap-envelope">
      <faultcode>S:Server</faultcode>
      <faultstring>TCS Error</faultstring>
      <detail>
        <ns2:TCSServiceFault xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
          <return_code>3001</return_code>
          <return_detail>The card has been declined, the transaction will not be processed.</return_detail>
        </ns2:TCSServiceFault>
      </detail>
    </S:Fault>
  </S:Body>
</S:Envelope>`;

describe("processPayment", () => {
  it("throws an error if we pass in an invalid request", async () => {
    await expect(
      processPayment(appContext, {
        foo: 20,
      } as any)
    ).rejects.toThrow();
  });

  describe("Successfully processed Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
    });

    it("returns the trackingId from the XML", async () => {
      const { trackingId } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(trackingId).toEqual(mockPayGovTrackingId);
    });

    it("returns the transactionStatus from the XML", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(transactionStatus).toEqual("Success");
    });
  });

  describe("Unsuccessful processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockUnsuccessfulResponse);
    });

    it("does not return a trackingId", async () => {
      const { trackingId } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(trackingId).toBeUndefined();
    });

    it("returns transactionStatus failed", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });
      expect(transactionStatus).toBe("Failed");
    });

    it("returns a message that indicates why the transaction failed", async () => {
      const { message } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(message).toBe(
        "The card has been declined, the transaction will not be processed."
      );
    });

    it("returns the error code from the pyment processor that indicates why the transaction failed", async () => {
      const { code } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(code).toBe(3001);
    });
  });

  describe("Pending processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    it("Returns a trackingId", async () => {
      const { trackingId } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });

      expect(trackingId).toBe(mockPayGovTrackingId);
    });

    it("returns transactionStatus from XML", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        appId: "asdf",
        token: "mock-token",
      });
      expect(transactionStatus).toBe("Received");
    });
  });
});
