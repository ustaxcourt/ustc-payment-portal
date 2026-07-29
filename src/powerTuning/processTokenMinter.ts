import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { APIGatewayEvent } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { logger } from "@utils/logger";

/**
 * Power-tuning pre-processor for the `processPayment` target. DEV-ONLY tuning
 * helper. This function directly invokes `initPayment` so that tuner has a fresh
 * token to work with. Gets replayed N times per power value during the tuner's
 * run. In short, call initPayment once before each processPayment invoke.
 *
 * How it mints a token (no SigV4 / no API Gateway):
 *   1. Directly invoke the dev `initPayment` Lambda with a crafted
 *      API-Gateway-shaped event (fresh `transactionReferenceId`, a fee the
 *      synthetic `ustc-power-tuning` client is allowed, and
 *      `requestContext.identity.userArn` set to that client). This leaves a new
 *      transaction row in `initiated` state with a Pay.gov token.
 *   2. Complete the payment on the forgiving mock Pay.gov test server over plain
 *      HTTP (the mock `/pay` endpoint is not SigV4-protected) so the subsequent
 *      `processPayment` -> `CompleteOnlineCollectionWithDetails` call finds a
 *      completed payment and does representative work.
 *
 * The row is deliberately left in `initiated` (NOT `processing`) so the tuner's
 * `processPayment` invocation is the one that performs the claim CAS.
 */

const INIT_PAYMENT_FUNCTION_NAME =
  process.env.INIT_PAYMENT_FUNCTION_NAME ??
  "ustc-payment-processor-initPayment";
const TUNING_FEE_KEY = process.env.TUNING_FEE_KEY ?? "PETITION_FILING_FEE";
const TUNING_CALLER_ARN =
  process.env.TUNING_CALLER_ARN ??
  "arn:aws:sts::723609007960:assumed-role/ustc-power-tuning/tuning";

// Static request-body fixture data — not environment-specific, so these are
// plain constants rather than env vars (Terraform never overrides them).
const TUNING_URL_SUCCESS = "http://example.com/success";
const TUNING_URL_CANCEL = "http://example.com/cancel";
const TUNING_PAYMENT_METHOD = "PLASTIC_CARD";
const TUNING_PAYMENT_STATUS = "Success";

const lambda = new LambdaClient({});

type InitResult = {
  token: string;
  paymentRedirect: string;
};

/**
 * Directly invoke the dev `initPayment` Lambda and return its `{ token,
 * paymentRedirect }` response. Throws if the invocation errors or does not
 * return a 200 with the expected fields.
 */
const mintInitiatedToken = async (): Promise<InitResult> => {
  const initEvent: Partial<APIGatewayEvent> = {
    body: JSON.stringify({
      transactionReferenceId: randomUUID(),
      fee: TUNING_FEE_KEY,
      urlSuccess: TUNING_URL_SUCCESS,
      urlCancel: TUNING_URL_CANCEL,
      metadata: { docketNumber: "power-tuning" },
    }),
    requestContext: {
      identity: { userArn: TUNING_CALLER_ARN },
    } as APIGatewayEvent["requestContext"],
  };

  const invocation = await lambda.send(
    new InvokeCommand({
      FunctionName: INIT_PAYMENT_FUNCTION_NAME,
      Payload: Buffer.from(JSON.stringify(initEvent)),
    }),
  );

  if (invocation.FunctionError) {
    const detail = invocation.Payload
      ? new TextDecoder().decode(invocation.Payload)
      : "<no payload>";
    throw new Error(
      `processTokenMinter: initPayment invocation failed (${invocation.FunctionError}): ${detail}`,
    );
  }

  if (!invocation.Payload) {
    throw new Error(
      "processTokenMinter: initPayment invocation returned no payload",
    );
  }

  const proxyResult = JSON.parse(
    new TextDecoder().decode(invocation.Payload),
  ) as { statusCode?: number; body?: string };

  if (proxyResult.statusCode !== 200) {
    throw new Error(
      `processTokenMinter: initPayment returned status ${
        proxyResult.statusCode
      }: ${proxyResult.body ?? "<no body>"}`,
    );
  }

  const initResponse = JSON.parse(
    proxyResult.body ?? "{}",
  ) as Partial<InitResult>;

  if (!initResponse.token || !initResponse.paymentRedirect) {
    throw new Error(
      "processTokenMinter: initPayment response missing token or paymentRedirect",
    );
  }

  return {
    token: initResponse.token,
    paymentRedirect: initResponse.paymentRedirect,
  };
};

/**
 * Complete the payment on the mock Pay.gov test server so the minted token is
 * ready for `processPayment`. Mirrors the markPayment flow in the integration
 * suite: POST `{paymentRedirect origin}/.../pay/{method}/{status}?token=...`.
 */
const completePaymentOnMock = async (
  paymentRedirect: string,
  token: string,
): Promise<void> => {
  const markUrl = new URL(paymentRedirect);
  const payPath = markUrl.pathname.endsWith("/pay")
    ? markUrl.pathname
    : `${markUrl.pathname.replace(/\/$/, "")}/pay`;

  markUrl.pathname = `${payPath}/${encodeURIComponent(
    TUNING_PAYMENT_METHOD,
  )}/${encodeURIComponent(TUNING_PAYMENT_STATUS)}`;
  markUrl.searchParams.set("token", token);

  const response = await fetch(markUrl, { method: "POST" });

  if (!response.ok) {
    const detail = await response.text().catch(() => "<unreadable>");
    throw new Error(
      `processTokenMinter: mock markPayment failed (${response.status}): ${detail}`,
    );
  }
};

export const processTokenMinter = async (
  event: APIGatewayEvent,
): Promise<APIGatewayEvent> => {
  const { token, paymentRedirect } = await mintInitiatedToken();
  await completePaymentOnMock(paymentRedirect, token);

  // Token value is intentionally NOT logged (sensitive Pay.gov session token).
  logger.info(
    "processTokenMinter: minted fresh token for processPayment tuning",
  );

  let baseBody: Record<string, unknown> = {};
  if (event.body) {
    try {
      const parsed: unknown = JSON.parse(event.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        baseBody = parsed as Record<string, unknown>;
      }
    } catch {
      // Base payload body is not JSON — fall back to a body carrying only the token.
      baseBody = {};
    }
  }

  return {
    ...event,
    body: JSON.stringify({ ...baseBody, token }),
  };
};

/**
 * Lambda entry point. Named `handler` so the Terraform handler string is
 * `processTokenMinter.handler`.
 */
export const handler = processTokenMinter;
