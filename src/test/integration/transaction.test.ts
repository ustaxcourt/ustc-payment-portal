import { ProcessPaymentRequest } from "../../types/ProcessPaymentRequest";
import { InitPaymentRequest } from "../../schemas/InitPayment.schema";
import { signedFetch } from "./sigv4Helper";

describe("make a transaction", () => {
  let token: string;
  let paymentRedirect: string;
  let payGovTrackingId: string;
  let isLocal: boolean;

  // Helper so every portal call uses SigV4 in deployed envs, plain fetch locally.
  // Pre-deployment:  SigV4 headers are ignored (auth is still NONE), so all calls return 200.
  // Post-deployment: API Gateway enforces AWS_IAM — only signed calls succeed.
  const portalFetch = (url: string, options: RequestInit = {}): Promise<Response> =>
    isLocal ? fetch(url, options) : signedFetch(url, options);

  beforeAll(() => {
    isLocal = process.env.NODE_ENV === "local";
  });

  it("should make a request to start a transaction", async () => {
    const randomNumber = Math.floor(Math.random() * 100000);

    const request: InitPaymentRequest = {
      transactionReferenceId: crypto.randomUUID(),
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
      metadata: { docketNumber: `${randomNumber}-26` },
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
      token,
    };

    console.log(`Time to process the transaction with token: ${token}`);

    const result = await portalFetch(`${process.env.BASE_URL}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.paymentStatus).toBe("success");
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].transactionStatus).toBe("processed");
  });

  it("should be able to get the details about the transaction", async () => {
    // payGovTrackingId is no longer in the process response (v2 contract).
    // Retrieve it via the dashboard endpoint using the token from init.
    const txnList = await portalFetch(`${process.env.BASE_URL}/transactions`);
    const txnBody = await txnList.json();
    const txns = Array.isArray(txnBody) ? txnBody : txnBody.data;
    const match = txns.find((t: any) => t.paygovToken === token);
    payGovTrackingId = match?.paygovTrackingId;

    console.log(
      `Time to get the details with payGovTrackingId: ${payGovTrackingId}`
    );

    expect(payGovTrackingId).toBeTruthy();

    const result = await portalFetch(
      `${process.env.BASE_URL}/details/${payGovTrackingId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBe(payGovTrackingId);
    expect(data.transactionStatus).toBe("processed");
  });
});
