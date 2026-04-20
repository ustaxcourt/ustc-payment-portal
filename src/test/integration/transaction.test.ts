import { ProcessPaymentRequest } from "../../types/ProcessPaymentRequest";
import { InitPaymentRequest } from "../../schemas/InitPayment.schema";
import { signedFetch } from "./sigv4Helper";

const isLocal = process.env.NODE_ENV === "local";

/**
 * Retrieves the Pay.gov mock server auth token.
 * - Locally: uses PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID directly as the token value.
 * - In CI: reads the token from AWS Secrets Manager using the secret ID.
 * - Returns undefined if no secret ID is configured (mark calls will be skipped).
 */
const getPayGovAuthToken = async (): Promise<string | undefined> => {
  const secretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;
  if (!secretId) return undefined;

  if (isLocal) return secretId;

  // In deployed environments, fetch from Secrets Manager
  const { getSecretString } = await import("../../clients/secretsClient");
  return getSecretString(secretId);
};

/**
 * Marks a payment status on the Pay.gov mock server before calling /process.
 * This simulates the user completing (or failing) the payment form on Pay.gov.
 */
const markPaymentStatus = async (
  payGovBaseUrl: string,
  token: string,
  paymentMethod: string,
  paymentStatus: string,
  authToken?: string,
): Promise<Response> => {
  const headers: { Authentication?: string } = authToken
    ? { Authentication: `Bearer ${authToken}` }
    : {};

  return fetch(
    `${payGovBaseUrl}/pay/${paymentMethod}/${paymentStatus}?token=${token}`,
    { method: "POST", headers },
  );
};

describe("make a transaction", () => {
  let token: string;
  let paymentRedirect: string;
  let payGovTrackingId: string;
  let payGovAuthToken: string | undefined;

  const portalFetch = (
    url: string,
    options: RequestInit = {},
  ): Promise<Response> =>
    isLocal ? fetch(url, options) : signedFetch(url, options);

  beforeAll(async () => {
    payGovAuthToken = await getPayGovAuthToken();
    if (!payGovAuthToken) {
      console.warn(
        "PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID not set — failed/pending integration tests will be skipped",
      );
    }
  });

  /**
   * Helper: runs the init flow and returns the token + paymentRedirect.
   */
  const initTransaction = async (metadata: InitPaymentRequest["metadata"]) => {
    const request: InitPaymentRequest = {
      transactionReferenceId: crypto.randomUUID(),
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
      metadata,
    };

    const result = await portalFetch(`${process.env.BASE_URL}/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(result.status).toBe(200);
    return result.json();
  };

  it("should make a request to start a transaction", async () => {
    const randomNumber = Math.floor(Math.random() * 100000);
    const data = await initTransaction({ docketNumber: `${randomNumber}-26` });

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
  }, 15_000);

  it("should be able to process the transaction", async () => {
    const request: ProcessPaymentRequest = { token };

    console.log(`Time to process the transaction with token: ${token}`);

    const result = await portalFetch(`${process.env.BASE_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      { headers: { "Content-Type": "application/json" } },
    );

    expect(result.status).toBe(200);

    const data = await result.json();
    expect(data.trackingId).toBe(payGovTrackingId);
    expect(data.transactionStatus).toBe("processed");
  });

  it("should be able to process a failed transaction", async () => {
    if (!payGovAuthToken) {
      console.warn("Skipping: no Pay.gov auth token available");
      return;
    }

    const initData = await initTransaction({ docketNumber: "failed-test-26" });
    console.log(`Processing failed transaction with token: ${initData.token}`);

    // Simulate a declined credit card on the Pay.gov mock server
    const payGovBaseUrl = new URL(initData.paymentRedirect).origin;
    const markResult = await markPaymentStatus(
      payGovBaseUrl,
      initData.token,
      "PLASTIC_CARD",
      "Failed",
      payGovAuthToken,
    );
    expect(markResult.status).toBe(200);

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
  });

  it("should be able to process a pending transaction", async () => {
    if (!payGovAuthToken) {
      console.warn("Skipping: no Pay.gov auth token available");
      return;
    }

    const initData = await initTransaction({ docketNumber: "pending-test-26" });
    console.log(`Processing pending transaction with token: ${initData.token}`);

    // Mark as ACH — the mock server returns "Received" (pending)
    // when completeOnlineCollectionWithDetails is called within 15 seconds of ACH initiation.
    const payGovBaseUrl = new URL(initData.paymentRedirect).origin;
    const markResult = await markPaymentStatus(
      payGovBaseUrl,
      initData.token,
      "ACH",
      "Success",
      payGovAuthToken,
    );
    expect(markResult.status).toBe(200);

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
