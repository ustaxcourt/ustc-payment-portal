import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/core/protocols";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { AwsCredentialIdentity } from "@smithy/types";

/**
 * Reads AWS credentials directly from environment variables.
 * Avoids defaultProvider() from @aws-sdk/credential-provider-node, which uses
 * ESM dynamic imports that break Jest without --experimental-vm-modules.
 */
const credentialsFromEnv = (): AwsCredentialIdentity => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set to sign requests. " +
        "Run `aws sso login --profile <profile>` and export credentials, or set them directly.",
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
};

/**
 * Assumes an IAM role and returns temporary credentials.
 * Used for testing with different IAM identities.
 */
export const assumeRole = async (
  roleArn: string,
  sessionName: string = "test-session",
): Promise<AwsCredentialIdentity> => {
  const sts = new STSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: sessionName,
    DurationSeconds: 900, // 15 minutes
  });

  const response = await sts.send(command);

  if (!response.Credentials) {
    throw new Error(`Failed to assume role ${roleArn}`);
  }

  const { AccessKeyId, SecretAccessKey, SessionToken } = response.Credentials;

  if (!AccessKeyId || !SecretAccessKey || !SessionToken) {
    throw new Error(`Assumed role ${roleArn} returned incomplete credentials`);
  }

  return {
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
  };
};

/**
 * Signs an HTTP request using specific credentials and calls fetch.
 * Useful for testing with assumed role credentials.
 */
export const signedFetchWithCredentials = async (
  url: string,
  credentials: AwsCredentialIdentity,
  options: RequestInit = {},
): Promise<Response> => {
  const urlObj = new URL(url);
  const region = process.env.AWS_REGION ?? "us-east-1";

  const signer = new SignatureV4({
    credentials,
    region,
    service: "execute-api",
    sha256: Sha256,
  });

  const body = options.body as string | undefined;
  const request = new HttpRequest({
    method: (options.method ?? "GET").toUpperCase(),
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    query: Object.fromEntries(urlObj.searchParams),
    headers: {
      host: urlObj.hostname,
      ...(options.headers as Record<string, string>),
    },
    body,
  });

  const signed = await signer.sign(request);

  return fetch(url, {
    ...options,
    headers: signed.headers,
  });
};

/**
 * Signs an HTTP request and returns the signed headers (without making the request).
 * Useful for testing tampered signatures.
 */
export const signRequest = async (
  url: string,
  options: RequestInit = {},
): Promise<Record<string, string>> => {
  const urlObj = new URL(url);
  const region = process.env.AWS_REGION ?? "us-east-1";

  const signer = new SignatureV4({
    credentials: credentialsFromEnv(),
    region,
    service: "execute-api",
    sha256: Sha256,
  });

  const body = options.body as string | undefined;
  const request = new HttpRequest({
    method: (options.method ?? "GET").toUpperCase(),
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    query: Object.fromEntries(urlObj.searchParams),
    headers: {
      host: urlObj.hostname,
      ...(options.headers as Record<string, string>),
    },
    body,
  });

  const signed = await signer.sign(request);
  return signed.headers as Record<string, string>;
};

/**
 * Signs an HTTP request with AWS Signature Version 4 and calls fetch.
 *
 * Reads credentials directly from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_SESSION_TOKEN environment variables. Throws a clear error if the required
 * vars are missing, rather than failing silently during signing.
 *
 * The service is hard-coded to "execute-api" (API Gateway). Region defaults to
 * AWS_REGION env var, falling back to "us-east-1".
 *
 * @param url     - Fully-qualified URL to request
 * @param options - Standard RequestInit options (method, headers, body)
 * @returns       - The same Response you would get from plain fetch()
 */
export const signedFetch = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const urlObj = new URL(url);
  const region = process.env.AWS_REGION ?? "us-east-1";

  const signer = new SignatureV4({
    credentials: credentialsFromEnv(),
    region,
    service: "execute-api",
    sha256: Sha256,
  });

  // Build a @smithy HttpRequest — this is what SignatureV4.sign() expects.
  const body = options.body as string | undefined;
  const request = new HttpRequest({
    method: (options.method ?? "GET").toUpperCase(),
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    query: Object.fromEntries(urlObj.searchParams),
    headers: {
      // "host" header is required for SigV4 signing.
      host: urlObj.hostname,
      ...(options.headers as Record<string, string>),
    },
    body,
  });

  const signed = await signer.sign(request);

  // signed.headers now contains Authorization, x-amz-date, and x-amz-security-token (if STS).
  return fetch(url, {
    ...options,
    headers: signed.headers,
  });
};

/**
 * Lane gating shared by the integration suites that require a deployed API
 * Gateway (sigv4Smoke, deployHealthSmoke, validateClient). These run in their own
 * npm scripts rather than the generic `test:integration*` folder run, so each one
 * needs the same credential/BASE_URL guards — keeping them here stops the skip
 * heuristic drifting between lanes.
 */

/** Whether the environment carries credentials that can sign a request. */
export const hasSigningCredentials = (): boolean =>
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY);

/**
 * True when running locally against a CI-only fixture. DEV_AWS_DEPLOYER_ROLE_ARN
 * is set in a developer's shell but not on the runner, so its presence means the
 * caller is not the deployer role the test needs.
 */
export const skipCiOnlyTest = (reason: string): boolean => {
  if (!process.env.DEV_AWS_DEPLOYER_ROLE_ARN) {
    return false;
  }

  console.log(`Skipping: ${reason}`);
  return true;
};

/** BASE_URL of the deployed stage under test. Throws rather than silently passing. */
export const mustGetBaseUrl = (): string => {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for SigV4 integration tests");
  }
  return url;
};

/**
 * Reads a response body as JSON, falling back to raw text. API Gateway's own
 * errors are JSON, but a non-JSON body is possible, so callers must handle both.
 */
export const parseJsonOrText = async <T = unknown>(
  result: Response,
): Promise<T | string> => {
  const raw = await result.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw;
  }
};
