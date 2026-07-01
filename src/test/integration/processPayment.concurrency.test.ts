import { isLocal } from "../../config/appEnv";
import { PROCESSING_CONFLICT_MESSAGE } from "../../db/TransactionModel";
import { InitPaymentRequest } from "../../schemas/InitPayment.schema";
import { ProcessPaymentResponse } from "../../schemas/ProcessPayment.schema";
import { signedFetch } from "./sigv4Helper";

type PayGovPaymentMethod = "PLASTIC_CARD" | "ACH" | "PAYPAL";
type PayGovPaymentStatus = "Success" | "Failed";

const baseUrl = process.env.BASE_URL;
const describeWithEnv = baseUrl ? describe : describe.skip;

describeWithEnv("POST /process concurrency", () => {
  beforeAll(() => {
    if (!baseUrl) {
      throw new Error(
        "BASE_URL is required for processPayment concurrency integration tests",
      );
    }
  });

  it("returns 200 and 409 when the same token is processed concurrently, with only one Pay.gov completion", async () => {
    const { token, paymentRedirect } = await initPayment();
    await markPayment(paymentRedirect, token, "PLASTIC_CARD", "Success");

    const [first, second] = await Promise.all([
      processPaymentRaw(token),
      processPaymentRaw(token),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const successResponse = first.status === 200 ? first : second;
    const conflictResponse = first.status === 409 ? first : second;

    const successBody = (await successResponse.json()) as ProcessPaymentResponse;
    expect(successBody.paymentStatus).toBe("success");
    expect(successBody.transactions).toHaveLength(1);
    expect(successBody.transactions[0].transactionStatus).toBe("processed");

    const conflictBody = (await conflictResponse.json()) as { message: string };
    expect(conflictBody.message).toBe(PROCESSING_CONFLICT_MESSAGE);

    const third = await processPaymentRaw(token);
    expect(third.status).toBe(410);
  });

  const portalFetch = (
    path: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const url = `${baseUrl}${path}`;
    return isLocal() ? fetch(url, options) : signedFetch(url, options);
  };

  const expectJsonOk = async <T>(
    response: Response,
    context: string,
  ): Promise<T> => {
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`${context} failed: ${response.status} ${raw}`);
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new Error(`${context} returned non-JSON: ${raw}. ${String(err)}`);
    }
  };

  const initPayment = async (): Promise<{
    token: string;
    paymentRedirect: string;
  }> => {
    const request: InitPaymentRequest = {
      transactionReferenceId: crypto.randomUUID(),
      fee: "PETITION_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
      metadata: { docketNumber: "12345-26" },
    };
    const result = await portalFetch("/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return expectJsonOk<{ token: string; paymentRedirect: string }>(
      result,
      "POST /init",
    );
  };

  const markPayment = async (
    paymentRedirect: string,
    token: string,
    paymentMethod: PayGovPaymentMethod,
    paymentStatus: PayGovPaymentStatus,
  ): Promise<void> => {
    const markUrl = new URL(paymentRedirect);
    const payPath = markUrl.pathname.endsWith("/pay")
      ? markUrl.pathname
      : `${markUrl.pathname.replace(/\/$/, "")}/pay`;

    markUrl.pathname = `${payPath}/${encodeURIComponent(
      paymentMethod,
    )}/${encodeURIComponent(paymentStatus)}`;
    markUrl.searchParams.set("token", token);

    await expectJsonOk<{ redirectUrl: string }>(
      await fetch(markUrl, { method: "POST" }),
      `POST ${markUrl.pathname}`,
    );
  };

  const processPaymentRaw = (token: string): Promise<Response> =>
    portalFetch("/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
});
