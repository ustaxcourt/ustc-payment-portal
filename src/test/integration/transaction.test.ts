import { ProcessPaymentRequest } from "../../types/ProcessPaymentRequest";
import { InitPaymentRequest } from "../../schemas/InitPayment.schema";
import { GetDetailsResponse } from "../../schemas/GetDetails.schema";
import { ProcessPaymentResponse } from "../../schemas/ProcessPayment.schema";
import { PaymentStatus } from "../../schemas/PaymentStatus.schema";
import { TransactionStatus } from "../../schemas/TransactionStatus.schema";
import { signedFetch } from "./sigv4Helper";

type PayGovPaymentMethod = "PLASTIC_CARD" | "ACH" | "PAYPAL";
type PayGovPaymentStatus = "Success" | "Failed";
type ApiPaymentMethod = "Credit/Debit Card" | "ACH" | "PayPal";

type Scenario = {
  name: string;
  paymentMethod: PayGovPaymentMethod;
  paymentStatus: PayGovPaymentStatus;
  expectedProcessPaymentStatus: PaymentStatus;
  expectedFinalPaymentStatus: Exclude<PaymentStatus, "pending">;
  expectedFinalTransactionStatus: Exclude<TransactionStatus, "pending">;
  expectedApiPaymentMethod: ApiPaymentMethod;
  expectPendingDuringResolution?: boolean;
};

const ACH_RESOLUTION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

const scenarios: Scenario[] = [
  {
    name: "Credit Card - Success",
    paymentMethod: "PLASTIC_CARD",
    paymentStatus: "Success",
    expectedProcessPaymentStatus: "success",
    expectedFinalPaymentStatus: "success",
    expectedFinalTransactionStatus: "processed",
    expectedApiPaymentMethod: "Credit/Debit Card",
  },
  {
    name: "Credit Card - Failed",
    paymentMethod: "PLASTIC_CARD",
    paymentStatus: "Failed",
    expectedProcessPaymentStatus: "failed",
    expectedFinalPaymentStatus: "failed",
    expectedFinalTransactionStatus: "failed",
    expectedApiPaymentMethod: "Credit/Debit Card",
  },
  {
    name: "ACH - Success",
    paymentMethod: "ACH",
    paymentStatus: "Success",
    expectedProcessPaymentStatus: "pending",
    expectedFinalPaymentStatus: "success",
    expectedFinalTransactionStatus: "processed",
    expectedApiPaymentMethod: "ACH",
    expectPendingDuringResolution: true,
  },
  {
    name: "ACH - Failed",
    paymentMethod: "ACH",
    paymentStatus: "Failed",
    expectedProcessPaymentStatus: "pending",
    expectedFinalPaymentStatus: "failed",
    expectedFinalTransactionStatus: "failed",
    expectedApiPaymentMethod: "ACH",
    expectPendingDuringResolution: true,
  },
  {
    name: "PayPal - Success",
    paymentMethod: "PAYPAL",
    paymentStatus: "Success",
    expectedProcessPaymentStatus: "success",
    expectedFinalPaymentStatus: "success",
    expectedFinalTransactionStatus: "processed",
    expectedApiPaymentMethod: "PayPal",
  },
  {
    name: "PayPal - Failed",
    paymentMethod: "PAYPAL",
    paymentStatus: "Failed",
    expectedProcessPaymentStatus: "failed",
    expectedFinalPaymentStatus: "failed",
    expectedFinalTransactionStatus: "failed",
    expectedApiPaymentMethod: "PayPal",
  },
];

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("make a transaction", () => {
  let transactionReferenceId: string;
  let isLocal: boolean;
  let baseUrl: string;

  // Helper so every portal call uses SigV4 in deployed envs, plain fetch locally.
  // Pre-deployment:  SigV4 headers are ignored (auth is still NONE), so all calls return 200.
  // Post-deployment: API Gateway enforces AWS_IAM — only signed calls succeed.
  const portalFetch = (
    url: string,
    options: RequestInit = {},
  ): Promise<Response> =>
    isLocal ? fetch(url, options) : signedFetch(url, options);

  const readErrorBody = async (response: Response): Promise<string> => {
    try {
      return await response.text();
    } catch (err) {
      return `Unable to read response body: ${String(err)}`;
    }
  };

  const expectJsonOk = async <T>(
    response: Response,
    context: string,
  ): Promise<T> => {
    const raw = await readErrorBody(response);
    if (!response.ok) {
      throw new Error(`${context} failed: ${response.status} ${raw}`);
    }

    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new Error(
        `${context} returned non-JSON response: ${raw}. Parse error: ${String(
          err,
        )}`,
      );
    }
  };

  const initTransaction = async (): Promise<{
    token: string;
    paymentRedirect: string;
    transactionReferenceId: string;
  }> => {
    const randomNumber = Math.floor(Math.random() * 100000);
    transactionReferenceId = crypto.randomUUID();

    const request: InitPaymentRequest = {
      transactionReferenceId,
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "http://example.com/success",
      urlCancel: "http://example.com/cancel",
      metadata: { docketNumber: `${randomNumber}-26` },
    };

    const result = await portalFetch(`${baseUrl}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const data = await expectJsonOk<{
      token: string;
      paymentRedirect: string;
    }>(result, `POST /init for ${transactionReferenceId}`);

    expect(data.token).toBeTruthy();
    expect(data.paymentRedirect).toBeTruthy();

    return {
      token: data.token,
      paymentRedirect: data.paymentRedirect,
      transactionReferenceId,
    };
  };

  const verifyPaymentRedirect = async (
    paymentRedirect: string,
  ): Promise<void> => {
    const result = await fetch(paymentRedirect);
    if (!result.ok) {
      throw new Error(
        `Loading payment redirect failed: ${
          result.status
        } ${await readErrorBody(result)}`,
      );
    }
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
    const result = await fetch(markUrl, { method: "POST" });
    const data = await expectJsonOk<{ redirectUrl: string }>(
      result,
      `POST ${markUrl.pathname}`,
    );

    expect(data.redirectUrl).toBe("http://example.com/success");
  };

  const processTransaction = async (
    token: string,
  ): Promise<ProcessPaymentResponse> => {
    const request: ProcessPaymentRequest = { token };
    const result = await portalFetch(`${baseUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    return expectJsonOk<ProcessPaymentResponse>(
      result,
      `POST /process for token ${token}`,
    );
  };

  const getDetails = async (
    referenceId: string,
  ): Promise<GetDetailsResponse> => {
    const result = await portalFetch(
      `${baseUrl}/details/${encodeURIComponent(referenceId)}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    return expectJsonOk<GetDetailsResponse>(
      result,
      `GET /details/${referenceId}`,
    );
  };

  const assertSingleTransaction = (
    response: ProcessPaymentResponse | GetDetailsResponse,
    scenario: Scenario,
    expectedPaymentStatus: PaymentStatus,
    expectedTransactionStatus: TransactionStatus,
  ) => {
    expect(response.paymentStatus).toBe(expectedPaymentStatus);
    expect(response.transactions).toHaveLength(1);
    expect(response.transactions[0].transactionStatus).toBe(
      expectedTransactionStatus,
    );
    expect(response.transactions[0].paymentMethod).toBe(
      scenario.expectedApiPaymentMethod,
    );
  };

  const waitForResolvedDetails = async (
    referenceId: string,
    scenario: Scenario,
    initialDetails: GetDetailsResponse,
  ): Promise<GetDetailsResponse> => {
    const deadline = Date.now() + ACH_RESOLUTION_TIMEOUT_MS;
    const seenStates = [
      `${initialDetails.paymentStatus}/${initialDetails.transactions[0]?.transactionStatus}`,
    ];
    let current = initialDetails;

    while (Date.now() < deadline) {
      if (current.paymentStatus === scenario.expectedFinalPaymentStatus) {
        return current;
      }

      await wait(POLL_INTERVAL_MS);
      current = await getDetails(referenceId);
      seenStates.push(
        `${current.paymentStatus}/${current.transactions[0]?.transactionStatus}`,
      );
    }

    throw new Error(
      `Timed out waiting for ACH resolution for ${referenceId}. Seen states: ${seenStates.join(
        " -> ",
      )}`,
    );
  };

  beforeAll(() => {
    baseUrl = process.env.BASE_URL ?? "";
    if (!baseUrl) {
      throw new Error("BASE_URL is required for transaction integration tests");
    }

    isLocal =
      process.env.NODE_ENV === "local" || process.env.LOCAL_DEV === "true";
    jest.setTimeout(60_000);
  });

  it.each(scenarios)("handles $name end-to-end", async (scenario) => {
    const initialized = await initTransaction();

    await verifyPaymentRedirect(initialized.paymentRedirect);
    await markPayment(
      initialized.paymentRedirect,
      initialized.token,
      scenario.paymentMethod,
      scenario.paymentStatus,
    );

    const processResponse = await processTransaction(initialized.token);
    assertSingleTransaction(
      processResponse,
      scenario,
      scenario.expectedProcessPaymentStatus,
      scenario.expectPendingDuringResolution
        ? "pending"
        : scenario.expectedFinalTransactionStatus,
    );

    const detailsResponse = await getDetails(
      initialized.transactionReferenceId,
    );

    if (scenario.expectPendingDuringResolution) {
      assertSingleTransaction(detailsResponse, scenario, "pending", "pending");

      const resolvedDetails = await waitForResolvedDetails(
        initialized.transactionReferenceId,
        scenario,
        detailsResponse,
      );

      assertSingleTransaction(
        resolvedDetails,
        scenario,
        scenario.expectedFinalPaymentStatus,
        scenario.expectedFinalTransactionStatus,
      );
      expect(resolvedDetails.transactions[0].payGovTrackingId).toBeTruthy();
      return;
    }

    assertSingleTransaction(
      detailsResponse,
      scenario,
      scenario.expectedFinalPaymentStatus,
      scenario.expectedFinalTransactionStatus,
    );
    expect(detailsResponse.transactions[0].payGovTrackingId).toBeTruthy();
  });
});
