import { signedFetch } from "./sigv4Helper";
import { InitPaymentRequest } from "../../schemas/InitPayment.schema";
import { ProcessPaymentResponse } from "../../schemas/ProcessPayment.schema";

type PayGovPaymentMethod = "PLASTIC_CARD" | "ACH" | "PAYPAL";
type PayGovPaymentStatus = "Success" | "Failed";

const baseUrl = process.env.BASE_URL;

describe("POST /process", () => {
  const isLocal = process.env.NODE_ENV === "local" || process.env.LOCAL_DEV === "true";

  beforeAll(() => {
    if (!baseUrl) {
      throw new Error("BASE_URL is required for process integration tests");
    }
  });

  it("returns success after a failed first attempt", async () => {
    const first = await initPayment();
    await markPayment(
      first.paymentRedirect,
      first.token,
      "PLASTIC_CARD",
      "Failed",
    );
    const firstFailed = await processPayment(first.token);
    expect(firstFailed.paymentStatus).toBe("failed");
    expect(firstFailed.transactions).toHaveLength(1);
    expect(firstFailed.transactions[0].transactionStatus).toBe("failed");

    const second = await initPayment(first.transactionReferenceId);
    await markPayment(
      second.paymentRedirect,
      second.token,
      "PLASTIC_CARD",
      "Success",
    );
    const secondProcessed = await processPayment(second.token);

    expect(secondProcessed.paymentStatus).toBe("success");
    expect(secondProcessed.transactions).toHaveLength(2);
    expect(secondProcessed.transactions[1].transactionStatus).toBe("processed");
  });

  it("returns failed after a failed first attempt", async () => {
    const first = await initPayment();
    await markPayment(
      first.paymentRedirect,
      first.token,
      "PLASTIC_CARD",
      "Failed",
    );
    const firstFailed = await processPayment(first.token);
    expect(firstFailed.paymentStatus).toBe("failed");
    expect(firstFailed.transactions).toHaveLength(1);
    expect(firstFailed.transactions[0].transactionStatus).toBe("failed");

    const second = await initPayment(first.transactionReferenceId);
    await markPayment(
      second.paymentRedirect,
      second.token,
      "PLASTIC_CARD",
      "Failed",
    );
    const secondFailed = await processPayment(second.token);

    expect(secondFailed.paymentStatus).toBe("failed");
    expect(secondFailed.transactions).toHaveLength(2);
    expect(secondFailed.transactions[1].transactionStatus).toBe("failed");
  });

  // UTIL Functions
  const portalFetch = (
    path: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const url = `${baseUrl}${path}`;
    return isLocal ? fetch(url, options) : signedFetch(url, options);
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

  const initPayment = async (
    existingReferenceId?: string,
  ): Promise<{
    token: string;
    paymentRedirect: string;
    transactionReferenceId: string;
  }> => {
    const transactionReferenceId = existingReferenceId ?? crypto.randomUUID();
    const request: InitPaymentRequest = {
      transactionReferenceId,
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
      metadata: { docketNumber: "12345-26" },
    };
    const result = await portalFetch("/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = await expectJsonOk<{ token: string; paymentRedirect: string }>(
      result,
      "POST /init",
    );
    return { ...data, transactionReferenceId };
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

  const processPayment = async (
    token: string,
  ): Promise<ProcessPaymentResponse> =>
    expectJsonOk<ProcessPaymentResponse>(
      await portalFetch("/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      `POST /process for token ${token}`,
    );
});
