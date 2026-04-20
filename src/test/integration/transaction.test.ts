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
  const portalFetch = (
    url: string,
    options: RequestInit = {},
  ): Promise<Response> =>
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
    expect(data.transactions[0].payGovTrackingId).toBeTruthy();
    payGovTrackingId = data.transactions[0].payGovTrackingId;
  });

  it("should be able to get the details about the transaction", async () => {
    console.log(
      `Time to get the details with payGovTrackingId: ${payGovTrackingId}`,
    );

    const result = await portalFetch(
      `${process.env.BASE_URL}/details/${encodeURIComponent(payGovTrackingId)}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBe(payGovTrackingId);
    expect(data.transactionStatus).toBe("processed");
  });

  it("should be able to process a failed transaction", async () => {
    // Start a fresh transaction for the failed path
    const initResult = await portalFetch(`${process.env.BASE_URL}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionReferenceId: crypto.randomUUID(),
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "http://example.com/success",
        urlCancel: "http://example.com/cancel",
        metadata: { docketNumber: "failed-test-26" },
      } satisfies InitPaymentRequest),
    });
    expect(initResult.status).toBe(200);
    const initData = await initResult.json();

    // Simulate a declined credit card on the Pay.gov mock server
    const payGovBaseUrl = new URL(initData.paymentRedirect).origin;
    const markResult = await fetch(
      `${payGovBaseUrl}/pay/PLASTIC_CARD/Failed?token=${initData.token}`,
      { method: "POST" },
    );
    expect(markResult.status).toBe(200);

    // Process the transaction — should come back as failed
    const processResult = await portalFetch(`${process.env.BASE_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initData.token }),
    });
    expect(processResult.status).toBe(200);

    const data = await processResult.json();
    console.log("Failed transaction response:", JSON.stringify(data));

    expect(data.paymentStatus).toBe("failed");
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].transactionStatus).toBe("failed");
    expect(data.transactions[0].returnDetail).toBeTruthy();
  });

  it("should be able to process a pending transaction", async () => {
    // Start a fresh transaction for the pending path
    const initResult = await portalFetch(`${process.env.BASE_URL}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionReferenceId: crypto.randomUUID(),
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "http://example.com/success",
        urlCancel: "http://example.com/cancel",
        metadata: { docketNumber: "pending-test-26" },
      } satisfies InitPaymentRequest),
    });
    expect(initResult.status).toBe(200);
    const initData = await initResult.json();

    // Mark as ACH on the Pay.gov mock server — the mock returns "Received" (pending)
    // when completeOnlineCollectionWithDetails is called within 15 seconds of ACH initiation.
    const payGovBaseUrl = new URL(initData.paymentRedirect).origin;
    const markResult = await fetch(
      `${payGovBaseUrl}/pay/ACH/Success?token=${initData.token}`,
      { method: "POST" },
    );
    expect(markResult.status).toBe(200);

    // Process immediately (within 15s) — should come back as pending
    const processResult = await portalFetch(`${process.env.BASE_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initData.token }),
    });
    expect(processResult.status).toBe(200);

    const data = await processResult.json();
    console.log("Pending transaction response:", JSON.stringify(data));

    expect(data.paymentStatus).toBe("pending");
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].transactionStatus).toBe("pending");
    expect(data.transactions[0].payGovTrackingId).toBeTruthy();
  });
});
