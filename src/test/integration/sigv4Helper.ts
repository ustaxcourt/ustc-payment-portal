import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@smithy/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";

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
