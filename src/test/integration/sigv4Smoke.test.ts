import { signedFetch, signRequest, assumeRole, signedFetchWithCredentials } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const hasSigningCredentials =
  Boolean(process.env.AWS_ACCESS_KEY_ID) && Boolean(process.env.AWS_SECRET_ACCESS_KEY);

const mustGetBaseUrl = (): string => {
  if (!baseUrl) {
    throw new Error("BASE_URL is required for SigV4 integration tests");
  }
  return baseUrl;
};

const parseJsonOrText = async (result: Response): Promise<any> => {
  const raw = await result.text();
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

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
const describeWithCreds = hasSigningCredentials ? describe : describe.skip;

describeWithCreds("SigV4 enforcement on protected endpoints", () => {
  const apiBaseUrl = mustGetBaseUrl();

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

    const data = await parseJsonOrText(result);

    console.log("Tampered signature response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/signature|Forbidden/i);
    }
  });
});

describe("Unsigned auth rejection", () => {
  const apiBaseUrl = mustGetBaseUrl();

  it("unsigned request returns 403", async () => {
    const result = await fetch(`${apiBaseUrl}/test`, {
      method: "GET",
    });

    const data = await parseJsonOrText(result);
    console.log("Unsigned request response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/Missing Authentication Token|Forbidden/i);
    }
  });

  it("unsigned request returns 403", async () => {
    const result = await fetch(`${apiBaseUrl}/init`, {
      method: "GET",
    });

    const data = await parseJsonOrText(result);
    console.log("Unsigned request response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/Missing Authentication Token|Forbidden/i);
    }
  });
});

describeWithCreds("SigV4 helper behavior and credential handling", () => {
  const apiBaseUrl = mustGetBaseUrl();

  it("signRequest returns SigV4 headers", async () => {
    const signedHeaders = await signRequest(`${apiBaseUrl}/test`, {
      method: "GET",
    });

    expect(signedHeaders.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(signedHeaders["x-amz-date"]).toBeDefined();
    expect(signedHeaders.host).toContain("execute-api");
  });

  it("signedFetchWithCredentials returns 200 with explicit credentials", async () => {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required");
    }

    const result = await signedFetchWithCredentials(
      `${apiBaseUrl}/test`,
      {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
      { method: "GET" },
    );

    const body = await result.text();
    console.log("signedFetchWithCredentials response:", result.status, body.slice(0, 200));

    expect(result.status).toBe(200);
  });

});

describe("Credential guardrails", () => {
  const apiBaseUrl = mustGetBaseUrl();

  it("throws a clear error when required AWS credentials are missing", async () => {
    const originalAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const originalSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    try {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      await expect(
        signedFetch(`${apiBaseUrl}/test`, {
          method: "GET",
        }),
      ).rejects.toThrow(
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set to sign requests",
      );
    } finally {
      if (originalAccessKeyId) {
        process.env.AWS_ACCESS_KEY_ID = originalAccessKeyId;
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
      }

      if (originalSecretAccessKey) {
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretAccessKey;
      } else {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
    }
  });
});

describe("API error status coverage", () => {
  const apiBaseUrl = mustGetBaseUrl();

  it("returns 400 for invalid payment status on dashboard endpoint", async () => {
    const result = await fetch(`${apiBaseUrl}/transactions/not-a-real-status`, {
      method: "GET",
    });

    const data = await parseJsonOrText(result);
    console.log("Invalid paymentStatus response:", result.status, data);

    expect(result.status).toBe(400);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/Invalid paymentStatus/i);
    }
  });

  it("returns 403 or 404 for unknown endpoint", async () => {
    const result = await fetch(`${apiBaseUrl}/definitely-not-a-real-route`, {
      method: "GET",
    });

    const data = await parseJsonOrText(result);
    console.log("Unknown endpoint response:", result.status, data);

    // API Gateway can return 403 (Missing Authentication Token) or 404,
    // depending on stage/resource configuration.
    expect([403, 404]).toContain(result.status);
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
  const apiBaseUrl = mustGetBaseUrl();

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
      `${apiBaseUrl}/init`,
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
