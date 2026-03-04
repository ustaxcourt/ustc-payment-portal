import { signedFetch, signRequest, assumeRole, signedFetchWithCredentials } from "./sigv4Helper";

/**
 *
 * PURPOSE
 * -------
 * Validates that API Gateway enforces AWS_IAM authorization:
 *   - Signed requests   → 200  (caller is authorized)
 *   - Unsigned requests → 403  (no Authorization header = rejected by API Gateway)
 *   - Tampered signatures → 403 (API Gateway detects signature mismatch)
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
describe("SigV4 enforcement smoke test", () => {
  const baseUrl = process.env.BASE_URL;

  // A minimal valid /init body. We only need API Gateway to evaluate auth —
  // the Lambda response doesn't matter for the 403 case.
  const body = JSON.stringify({
    trackingId: "smoke-test",
    amount: 1,
    appId: "smoke",
    feeId: "PETITION_FILING_FEE",
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

    const data = await result.json();
    console.log(result);
    console.log(data);

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

    const data = await result.json();
    console.log(result);
    console.log(data);

    // Pre-deployment:  FAILS — returns 200 because API Gateway auth is still NONE.
    // Post-deployment: passes — API Gateway rejects unsigned request with 403.
    expect(result.status).toBe(403);

    // API Gateway returns a specific error message for missing auth
    expect(data.message).toMatch(/Missing Authentication Token|Forbidden/i);
  });

  it("tampered signature returns 403", async () => {
    // Get valid signed headers
    const signedHeaders = await signRequest(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

    // Tamper with the Authorization header by corrupting the signature portion
    const tamperedAuth = signedHeaders.authorization.replace(
      /Signature=[a-f0-9]+/,
      "Signature=0000000000000000000000000000000000000000000000000000000000000000"
    );

    const result = await fetch(`${baseUrl}/init`, {
      method: "POST",
      headers: {
        ...signedHeaders,
        authorization: tamperedAuth,
      },
      body,
    });

    const data = await result.json();
    console.log("Tampered signature response:", result.status, data);

    // API Gateway validates the signature and rejects tampered requests
    expect(result.status).toBe(403);
    expect(data.message).toMatch(/signature|Forbidden/i);
  });
});

/**
 * LAMBDA-LEVEL AUTHORIZATION TESTS
 * ================================
 * These tests validate that the Lambda correctly rejects requests that pass
 * API Gateway authentication but fail application-level authorization.
 *
 * REQUIREMENTS:
 * Set TEST_UNAUTHORIZED_ROLE_ARN environment variable to the ARN of a role that:
 *   - Is in an AWS account allowed by the API Gateway resource policy
 *   - Is NOT registered in the client-permissions Secrets Manager secret
 *
 * The Terraform creates this role automatically as `${namespace}-test-unauthorized-role`.
 * CI/CD passes the role ARN via Terraform outputs.
 *
 * These tests are skipped when TEST_UNAUTHORIZED_ROLE_ARN is not set.
 */
const testUnauthorizedRoleArn = process.env.TEST_UNAUTHORIZED_ROLE_ARN;
const describeLambdaAuth = testUnauthorizedRoleArn ? describe : describe.skip;

describeLambdaAuth("Lambda-level authorization", () => {
  const baseUrl = process.env.BASE_URL;

  const body = JSON.stringify({
    trackingId: "auth-test",
    amount: 1,
    appId: "test",
    feeId: "PETITION_FILING_FEE",
    urlSuccess: "https://example.com",
    urlCancel: "https://example.com",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  it("unregistered client receives 403 with 'Client not registered'", async () => {
    // Assume the test-unauthorized role (which is NOT in client-permissions)
    const credentials = await assumeRole(
      testUnauthorizedRoleArn!,
      "unregistered-client-test"
    );

    // Sign and make request using the assumed role's credentials
    const result = await signedFetchWithCredentials(
      `${baseUrl}/init`,
      credentials,
      {
        method: "POST",
        headers,
        body,
      }
    );

    const data = await result.json();
    console.log("Unregistered client response:", result.status, data);

    // Lambda should reject with 403 and "Client not registered"
    // (API Gateway already accepted the request — signature was valid)
    expect(result.status).toBe(403);
    expect(data.message).toContain("Client not registered");
  });
});
