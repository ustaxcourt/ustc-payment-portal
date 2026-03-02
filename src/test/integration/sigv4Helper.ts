import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { AwsCredentialIdentity } from "@smithy/types";

/**
 * Assumes an IAM role and returns temporary credentials.
 * Used for testing with different IAM identities.
 */
export const assumeRole = async (
  roleArn: string,
  sessionName: string = "test-session"
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

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken,
  };
};

/**
 * Signs an HTTP request using specific credentials and calls fetch.
 * Useful for testing with assumed role credentials.
 */
export const signedFetchWithCredentials = async (
  url: string,
  credentials: AwsCredentialIdentity,
  options: RequestInit = {}
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
    path: urlObj.pathname + urlObj.search,
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
  options: RequestInit = {}
): Promise<Record<string, string>> => {
  const urlObj = new URL(url);
  const region = process.env.AWS_REGION ?? "us-east-1";

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: "execute-api",
    sha256: Sha256,
  });

  const body = options.body as string | undefined;
  const request = new HttpRequest({
    method: (options.method ?? "GET").toUpperCase(),
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
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
 * Uses credentials from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_SESSION_TOKEN) or any provider chain supported by @aws-sdk/credential-provider-node
 * (e.g., IAM role assumed via ~/.aws/credentials).
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
  options: RequestInit = {}
): Promise<Response> => {
  const urlObj = new URL(url);
  const region = process.env.AWS_REGION ?? "us-east-1";

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: "execute-api",
    sha256: Sha256,
  });

  // Build a @smithy HttpRequest — this is what SignatureV4.sign() expects.
  const body = options.body as string | undefined;
  const request = new HttpRequest({
    method: (options.method ?? "GET").toUpperCase(),
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
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
