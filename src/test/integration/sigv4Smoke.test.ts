import { signedFetch, signRequest, assumeRole, signedFetchWithCredentials } from "./sigv4Helper";

/**
 * PURPOSE
 * -------
 * Validates that API Gateway enforces AWS_IAM authorization on /init:
 *   - Signed requests   → not 403  (request passed auth, reached Lambda)
 *   - Unsigned requests → 403  (rejected by API Gateway)
 *   - Tampered signatures → 403 (API Gateway detects signature mismatch)
 *
 * The signed test asserts "not 403" rather than "exactly 200" because Lambda may
 * return 400 for validation reasons (e.g. unseeded fees table). Any non-403 proves
 * the request passed SigV4 auth and reached the handler. Requires the caller's IAM
 * role to be registered in client-permissions (true in CI, not necessarily locally).
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

  it("signed request passes API Gateway auth", async () => {
    const result = await signedFetch(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

    const raw = await result.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    console.log("Signed request response:", result.status, data);

    // A 403 means API Gateway rejected the SigV4 signature.
    // Any other status (200, 400) proves auth passed and Lambda was invoked.
    // Note: running locally with an unregistered role returns a Lambda-level 403
    // ("Client not registered") which will fail here — that's expected. In CI the
    // deployer role is registered in client-permissions.
    expect(result.status).not.toBe(403);
  });

  it("unsigned request returns 403", async () => {
    const result = await fetch(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

    const raw = await result.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    console.log("Unsigned request response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/Missing Authentication Token|Forbidden/i);
    }
  });

  it("tampered signature returns 403", async () => {
    const signedHeaders = await signRequest(`${baseUrl}/init`, {
      method: "POST",
      headers,
      body,
    });

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
