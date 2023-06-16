import { ProcessPaymentRequest } from "../../src/useCases/processPayment";
import { InitPaymentRequest } from "../../src/types/InitPaymentRequest";
import { getConfig } from "./helpers";
import { v4 as uuidv4 } from "uuid";

describe("make a transaction", () => {
  let baseUrl: string;
  let token: string;
  let paymentRedirect: string;
  let appId: string;

  beforeAll(() => {
    const config = getConfig();
    baseUrl = config.baseUrl;
    appId = config.tcsAppId;
  });

  it("should make a request to start a transaction", async () => {
    const request: InitPaymentRequest = {
      trackingId: uuidv4(),
      amount: 20.0,
      appId,
      urlSuccess: "http://example.com",
      urlCancel: "http://example.com",
    };
    console.log(request);
    const result = await fetch(`${baseUrl}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    expect(result.status).toBe(200);

    const data = await result.json();
    token = data.token;
    paymentRedirect = data.paymentRedirect;
    expect(token).toBeTruthy();
    expect(paymentRedirect).toBeTruthy();
  });

  it("should be able to load the paymentUrl", async () => {
    const result = await fetch(paymentRedirect);
    expect(result.status).toBe(200);
  });

  it("should be able to process the transaction", async () => {
    const request: ProcessPaymentRequest = {
      appId: "asdf123",
      token,
    };

    const result = await fetch(`${baseUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBeTruthy();
  });
});
