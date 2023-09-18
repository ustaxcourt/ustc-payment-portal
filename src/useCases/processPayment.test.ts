import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";

const mockPayGovTrackingId = "211d8c91c046404fb159b52d042a12ba";
const mockSoapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">rO0ABXdlABZ3ZWJsb2dpYy5hcHAudGNzb25saW5lAAAA1gAAACN3ZWJsb2dpYy53b3JrYXJlYS5TdHJpbmdXb3JrQ29udGV4dAAedjguMi4wLjgwMjAyMjlfMjAyM18wNV8wNF8xMzIyAAA=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>`;

describe("initPayment", () => {
  it("throws an error if we pass in an invalid request", async () => {
    await expect(
      processPayment(appContext, {
        foo: 20,
      } as any)
    ).rejects.toThrow();
  });

  it("does not throw an error if we pass in a valid request", async () => {
    appContext.postHttpRequest = jest.fn().mockReturnValue(mockSoapResponse);

    const { trackingId } = await processPayment(appContext, {
      appId: "asdf",
      token: "mock-token",
    });

    expect(trackingId).toEqual(mockPayGovTrackingId);
  });
});
