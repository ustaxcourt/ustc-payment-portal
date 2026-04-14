import { signedFetch, signRequest, assumeRole, signedFetchWithCredentials } from "./sigv4Helper";

/**
 * PURPOSE
 * -------
 * Validates that API Gateway enforces AWS_IAM authorization:
 *   - Signed requests   → 200  (caller is authorized)
 *   - Unsigned requests → 403  (no Authorization header = rejected by API Gateway)
 *   - Tampered signatures → 403 (API Gateway detects signature mismatch)
 *
 * Uses GET /test for auth smoke tests — it has AWS_IAM authorization and no
 * database or seeding dependencies, so results depend purely on authentication.
 *
 * HOW TO RUN
 * ----------
 * Requires AWS credentials in the environment (IAM role or static keys with
 * execute-api:Invoke permission on the deployed API Gateway).
 *
 *   BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/<stage> \
 *   AWS_REGION=us-east-1 npx jest sigv4Smoke
 */
describe("SigV4 enforcement smoke test", () => {
  const baseUrl = process.env.BASE_URL;

  // Use GET /test for auth smoke tests — it has AWS_IAM authorization and no
  // database dependencies, so the result depends purely on authentication.
  // Using /init previously caused false failures when the fees table was unseeded.

  it("signed request returns 200", async () => {
    const result = await signedFetch(`${baseUrl}/test`, {
      method: "GET",
    });

    const text = await result.text();
    console.log("Signed request response:", result.status, text.slice(0, 200));

    expect(result.status).toBe(200);
  });

  it("unsigned request returns 403", async () => {
    const result = await fetch(`${baseUrl}/test`, {
      method: "GET",
    });

    const data = await result.json();
    console.log("Unsigned request response:", result.status, data);

    expect(result.status).toBe(403);
    expect(data.message).toMatch(/Missing Authentication Token|Forbidden/i);
  });

  it("tampered signature returns 403", async () => {
    const signedHeaders = await signRequest(`${baseUrl}/test`, {
      method: "GET",
    });

    const tamperedAuth = signedHeaders.authorization.replace(
      /Signature=[a-f0-9]+/,
      "Signature=0000000000000000000000000000000000000000000000000000000000000000"
    );

    const result = await fetch(`${baseUrl}/test`, {
      method: "GET",
      headers: {
        ...signedHeaders,
        authorization: tamperedAuth,
      },
    });

    const raw = await result.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
      console.log("Non-JSON error body:", data);
    }

    console.log("Tampered signature response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/signature|Forbidden/i);
    }
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
    transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
    feeId: "PETITION_FILING_FEE",
    urlSuccess: "https://example.com",
    urlCancel: "https://example.com",
    metadata: { docketNumber: "123-26" },
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
