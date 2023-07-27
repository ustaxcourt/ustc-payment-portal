import { ProcessPaymentRequest } from "../../types/ProcessPaymentRequest";
import { InitPaymentRequest } from "../../types/InitPaymentRequest";
import { loadLocalConfig } from "../loadLocalConfig";

describe("make a transaction", () => {
  let token: string;
  let paymentRedirect: string;
  const appId = "ustc-local-app-test";

  beforeAll(() => {
    loadLocalConfig();
  });

  it("should make a request to start a transaction", async () => {
    const randomNumber = Math.floor(Math.random() * 100000);

    const request: InitPaymentRequest = {
      trackingId: `test${randomNumber}`,
      amount: 20.0,
      appId,
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
    };

    const url = `${process.env.BASE_URL}/init`;
    const result = await fetch(url, {
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
    console.log(`Received a token: ${token}`);
    console.log(`Have a payment redirect: ${paymentRedirect}`);
  });

  it("should be able to load the paymentUrl", async () => {
    const result = await fetch(paymentRedirect);
    expect(result.status).toBe(200);
    console.log(`Looking good at the payment redirect: ${paymentRedirect}`);
  });

  it("should be able to process the transaction", async () => {
    const request: ProcessPaymentRequest = {
      appId,
      token,
    };

    console.log(
      `Time to process the transaction with this appId ${appId}; token: ${token}`
    );

    const result = await fetch(`${process.env.BASE_URL}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBeTruthy();
    expect(data.transactionStatus).toBe("Success");
  });
});
