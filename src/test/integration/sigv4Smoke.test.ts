import { signedFetch } from "./sigv4Helper";

/**
 *
 * PURPOSE
 * -------
 * Validates that API Gateway enforces AWS_IAM authorization:
 *   - Signed requests   → 200  (caller is authorized)
 *   - Unsigned requests → 403  (no Authorization header = rejected by API Gateway)
 *
 * CURRENT STATUS (pre-deployment of Phase 1 Terraform)
 * -----------------------------------------------------
 * These tests CANNOT pass simultaneously until Phase 1 is deployed:
 *
 *   ✅ "signed request returns 200"
 *      PASSES — but for the wrong reason. API Gateway authorization is still
 *      set to NONE in the live environment, so the extra SigV4 headers are
 *      ignored and the Lambda handles the request normally.
 *
 *   ❌ "unsigned request returns 403"
 *      FAILS — returns 200. Without AWS_IAM enforcement on API Gateway, there
 *      is nothing to reject an unsigned request. The Lambda receives the call
 *      and responds successfully.
 *
 * EXPECTED STATUS (post-deployment of Phase 1 Terraform)
 * -------------------------------------------------------
 *   ✅ "signed request returns 200"
 *      PASSES for the right reason. API Gateway validates the SigV4 signature,
 *      confirms the IAM identity is in the resource policy, and forwards to Lambda.
 *
 *   ✅ "unsigned request returns 403"
 *      PASSES. API Gateway rejects the request before Lambda is ever invoked.
 *      The response body will be API Gateway's default "Missing Authentication Token"
 *      or "Forbidden" JSON — NOT a Lambda response.
 *
 * HOW TO RUN
 * ----------
 * Requires AWS credentials in the environment (IAM role or static keys with
 * execute-api:Invoke permission on the deployed API Gateway).
 *
 *   NODE_ENV=stg BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/stg \
 *   AWS_REGION=us-east-1 npx jest sigv4Smoke
 */
describe("SigV4 enforcement smoke test (Phase 3.3)", () => {
  const baseUrl = process.env.BASE_URL;

  // A minimal valid /init body. We only need API Gateway to evaluate auth —
  // the Lambda response doesn't matter for the 403 case.
  const body = JSON.stringify({
    trackingId: "smoke-test",
    amount: 1,
    appId: "smoke",
    feeId: "PETITIONS_FILING_FEE",
    urlSuccess: "https://example.com",
    urlCancel: "https://example.com",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  it("signed request returns 200", async () => {
    const result = await signedFetch(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

    // Pre-deployment:  passes (auth is NONE, Lambda handles it).
    // Post-deployment: passes (SigV4 accepted, Lambda handles it).
    expect(result.status).toBe(200);
  });

  it("unsigned request returns 403", async () => {
    const result = await fetch(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

    // Pre-deployment:  FAILS — returns 200 because API Gateway auth is still NONE.
    // Post-deployment: passes — API Gateway rejects unsigned request with 403.
    expect(result.status).toBe(403);
  });
});
