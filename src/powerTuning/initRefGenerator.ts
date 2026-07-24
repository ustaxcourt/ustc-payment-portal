import type { APIGatewayEvent } from "aws-lambda";
import { randomUUID } from "node:crypto";

/**
 * Power-tuning pre-processor for the `initPayment` target. DEV-ONLY tuning
 * helper — zero AWS access, pure payload rewrite.
 *
 * Why this exists: aws-lambda-power-tuning replays the SAME base payload N times
 * per power value. `initPayment` dedupes on `transactionReferenceId`
 * (findInFlightByReferenceId + the partial unique index
 * `idx_transactions_unique_active`), so identical replays would short-circuit to
 * "return existing in-flight" — a fast DB read — instead of exercising the real
 * StartOnlineCollection SOAP call + insert path. That would make the tuning
 * measurement unrepresentative.
 *
 * This pre-processor rewrites the request body with a fresh
 * `transactionReferenceId` on every invocation so each tuned `initPayment` call
 * does representative work.
 *
 * Contract (aws-lambda-power-tuning): the tuner invokes this function with the
 * base target payload before each iteration and uses the returned value as the
 * payload for that iteration's `initPayment` invocation. Everything else on the
 * event — notably `requestContext.identity.userArn`, which drives the auth chain
 * on direct invocation — is passed through unchanged.
 */
export const initRefGenerator = async (
  event: APIGatewayEvent,
): Promise<APIGatewayEvent> => {
  const rawBody = event.body ?? "{}";

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("expected a JSON object");
    }
    body = parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `initRefGenerator: base payload body is not a valid JSON object: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const nextBody = {
    ...body,
    transactionReferenceId: randomUUID(),
  };

  return {
    ...event,
    body: JSON.stringify(nextBody),
  };
};

/**
 * Lambda entry point. Named `handler` so the Terraform handler string is
 * `initRefGenerator.handler`.
 */
export const handler = initRefGenerator;
