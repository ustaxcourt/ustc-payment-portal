import { ProcessPaymentRequest } from "../../types/ProcessPaymentRequest";
import { InitPaymentRequest } from "../../types/InitPaymentRequest";
import { getSecretString } from "../../clients/secretsClient";
import { signedFetch } from "./sigv4Helper";

describe("make a transaction", () => {
  let token: string;
  let paymentRedirect: string;
  let payGovTrackingId: string;
  let appId: string;
  let isLocal: boolean;

  beforeAll(async () => {
    isLocal = process.env.NODE_ENV === "local";
    if (isLocal) {
      appId = process.env.TCS_APP_ID as string;
    } else {
      appId = await getSecretString(process.env.TCS_APP_ID as string);
    }
  });

  // Helper so every portal call uses SigV4 in deployed envs, plain fetch locally.
  // Pre-deployment:  SigV4 headers are ignored (auth is still NONE), so all calls return 200.
  // Post-deployment: API Gateway enforces AWS_IAM — only signed calls succeed.
  const portalFetch = (url: string, options: RequestInit = {}): Promise<Response> =>
    isLocal ? fetch(url, options) : signedFetch(url, options);

  it("should make a request to start a transaction", async () => {
    const randomNumber = Math.floor(Math.random() * 100000);

    const request: InitPaymentRequest = {
      trackingId: `test${randomNumber}`,
      amount: 20,
      appId,
      feeId: "PETITIONS_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
    };

    const url = `${process.env.BASE_URL}/init`;
    const result = await portalFetch(url, {
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
    // This is an external pay.gov URL — no SigV4 needed.
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

    const result = await portalFetch(`${process.env.BASE_URL}/process`, {
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
    payGovTrackingId = data.trackingId;
  });

  it("should be able to get the details about the transaction", async () => {
    console.log(
      `Time to get the details with this appId ${appId}; payGovTrackingId: ${payGovTrackingId}`
    );

    const result = await portalFetch(
      `${process.env.BASE_URL}/details/${appId}/${payGovTrackingId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBe(payGovTrackingId);
    expect(data.transactionStatus).toBe("Success");
  });
});
