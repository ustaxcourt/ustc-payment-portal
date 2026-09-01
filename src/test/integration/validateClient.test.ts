import {
  assumeRole,
  signRequest,
  signedFetch,
  signedFetchWithCredentials,
} from "./sigv4Helper";

jest.setTimeout(20000); // end-to-end calls can exceed Jest's 5s default

/**
 * PURPOSE
 * -------
 * GET /validate-client is the pre-golive credential check a newly registered
 * client calls before going live. Its diagnostic value is that the three
 * rejection layers are distinguishable, so these tests exercise each one:
 *
 *   - API Gateway   → unsigned or tampered signature, or an account outside the
 *                     resource policy. Rejected before Lambda runs.
 *   - Lambda        → signature valid, but the signing role is not in the
 *                     client-permissions secret ("Client not registered").
 *   - Use case      → role registered, but its fee keys are wrong.
 *
 * All three return 403. Only the body tells them apart, so every assertion here
 * checks the message, not just the status.
 *
 * PREREQUISITE for the 200 case: the caller's role must be registered in the
 * target environment's client-permissions secret with concrete fee keys. A role
 * registered with the `["*"]` wildcard is rejected by design and will fail that
 * test — see the wildcard note in the use case.
 *
 * HOW TO RUN
 * ----------
 * Needs a deployed API Gateway — the local devServer has no /validate-client
 * route and cannot reproduce SigV4 rejection at all. Like sigv4Smoke.test.ts,
 * this file is excluded from the generic `test:integration*` scripts and runs in
 * its own lane:
 *
 *   BASE_URL=<api-gateway-url> AWS_REGION=us-east-1 \
 *   npm run test:integration:validate-client
 */

const hasSigningCredentials =
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY);
const isLocalCiOnlySkipMode = Boolean(process.env.DEV_AWS_DEPLOYER_ROLE_ARN);

const skipCiOnlyTest = (reason: string): boolean => {
  if (!isLocalCiOnlySkipMode) {
    return false;
  }

  console.log(`Skipping: ${reason}`);
  return true;
};

const mustGetBaseUrl = (): string => {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for SigV4 integration tests");
  }
  return url;
};

/**
 * Every response this endpoint can produce is one of these two shapes: the
 * success body, or an error body carrying `message`. API Gateway's own 403s are
 * JSON too, but a non-JSON body is possible, so the string case stays.
 */
type ValidateClientBody = {
  clientName?: string;
  allowedFeeKeys?: string[];
  message?: string;
};

const parseJsonOrText = async (
  result: Response,
): Promise<ValidateClientBody | string> => {
  const raw = await result.text();
  try {
    return JSON.parse(raw) as ValidateClientBody;
  } catch {
    return raw;
  }
};

const describeWithCreds = hasSigningCredentials ? describe : describe.skip;

describeWithCreds("GET /validate-client — registered client", () => {
  let validateClientUrl: string;

  beforeAll(() => {
    validateClientUrl = `${mustGetBaseUrl()}/validate-client`;
  });

  it("returns 200 with clientName and allowedFeeKeys", async () => {
    if (
      skipCiOnlyTest(
        "test requires credentials registered in CI client-permissions",
      )
    ) {
      return;
    }

    const result = await signedFetch(validateClientUrl, { method: "GET" });
    const data = (await result.json()) as ValidateClientBody;
    console.log("Signed validate-client response:", result.status, data);

    // Flat 200, not "200 or 403": cicd-dev.yml rewrites this caller's entry with
    // concrete fee keys, so a 403 here is a real failure, not an unknown fixture.
    expect(result.status).toBe(200);
    expect(typeof data.clientName).toBe("string");
    expect(data.clientName?.length).toBeGreaterThan(0);
    expect(Array.isArray(data.allowedFeeKeys)).toBe(true);
    // The wildcard and the empty set are both rejected, so a 200 always has a key.
    expect(data.allowedFeeKeys?.length).toBeGreaterThan(0);
    expect(data.allowedFeeKeys).not.toContain("*");
  });
});

describeWithCreds("GET /validate-client — API Gateway layer", () => {
  let validateClientUrl: string;

  beforeAll(() => {
    validateClientUrl = `${mustGetBaseUrl()}/validate-client`;
  });

  it("unsigned request returns 403 without reaching Lambda", async () => {
    const result = await fetch(validateClientUrl, { method: "GET" });
    const data = await parseJsonOrText(result);
    console.log("Unsigned validate-client response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(
        /Missing Authentication Token|Forbidden|not authorized/i,
      );
      // API Gateway's own body, never the Lambda's.
      expect(data.message).not.toContain("Client not registered");
    }
  });

  it("tampered signature returns 403 without reaching Lambda", async () => {
    const signedHeaders = await signRequest(validateClientUrl, {
      method: "GET",
    });

    const tamperedAuth = signedHeaders.authorization.replace(
      /Signature=[a-f0-9]+/,
      "Signature=0000000000000000000000000000000000000000000000000000000000000000",
    );

    const result = await fetch(validateClientUrl, {
      method: "GET",
      headers: {
        ...signedHeaders,
        authorization: tamperedAuth,
      },
    });

    const data = await parseJsonOrText(result);
    console.log("Tampered validate-client response:", result.status, data);

    expect(result.status).toBe(403);
    if (typeof data === "object" && data !== null) {
      expect(data.message).toMatch(/signature|Forbidden|not authorized/i);
      expect(data.message).not.toContain("Client not registered");
    }
  });
});

/**
 * The test that earns the endpoint its keep: a signature API Gateway accepts,
 * from a role the client-permissions secret does not know. Distinguishing this
 * from the Gateway-layer 403 above is the whole diagnostic.
 *
 * Terraform creates the role as `${namespace}-test-unauthorized-role` and CI
 * passes its ARN through as TEST_UNAUTHORIZED_ROLE_ARN. Skipped when unset.
 */
const testUnauthorizedRoleArn = process.env.TEST_UNAUTHORIZED_ROLE_ARN ?? "";
const describeLambdaAuth =
  hasSigningCredentials && testUnauthorizedRoleArn ? describe : describe.skip;

describeLambdaAuth("GET /validate-client — Lambda layer", () => {
  let validateClientUrl: string;

  beforeAll(() => {
    validateClientUrl = `${mustGetBaseUrl()}/validate-client`;
  });

  it("unregistered role returns 403 'Client not registered'", async () => {
    // The trust policy on the test-unauthorized role only allows the dev
    // deployer role to assume it, and in CI the runner already IS that role.
    // Locally the assumption cannot be chained, so this is skipped.
    if (
      skipCiOnlyTest("test requires CI execution (runner must be deployer role)")
    ) {
      return;
    }

    const credentials = await assumeRole(
      testUnauthorizedRoleArn,
      "validate-client-unregistered-test",
    );

    const result = await signedFetchWithCredentials(
      validateClientUrl,
      credentials,
      { method: "GET" },
    );

    const data = await parseJsonOrText(result);
    console.log("Unregistered validate-client response:", result.status, data);

    expect(result.status).toBe(403);
    expect(typeof data).toBe("object");
    if (typeof data === "object" && data !== null) {
      expect(data.message).toContain("Client not registered");
    }
  });
});
