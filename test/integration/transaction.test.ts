import { ProcessPaymentRequest } from "../../src/useCases/processPayment";
import { InitPaymentRequest } from "../../src/useCases/initPayment";
import { getConfig } from "./helpers";
describe("make a transaction", () => {
  let baseUrl: string;
  let token: string;
  let paymentRedirect: string;

  beforeAll(() => {
    const config = getConfig();
    baseUrl = config.baseUrl;
  });

  it("should make a request to start a transaction", async () => {
    const request: InitPaymentRequest = {
      trackingId: "asdf123",
      amount: 20,
      appId: "asdf123",
      urlSuccess: "http://example.com",
      urlCancel: "http://example.com",
    };
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
