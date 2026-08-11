import { getSecretString } from "@clients/secretsClient";
import { isLocal } from "../config/appEnv";
import type { AppContextLogger } from "@appTypes/AppContext";

// Dev's SOAP_URL points at the mock ustc-pay-gov-test-server, which authenticates
// requests via this bearer token instead of the mTLS cert stg/prod use against real Pay.gov.
export async function getPayGovAuthHeaders(
  logger: AppContextLogger,
): Promise<{ Authorization?: string; Authentication?: string }> {
  const tokenSecretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;
  if (!tokenSecretId) return {};

  if (isLocal()) {
    const bearer = `Bearer ${tokenSecretId}`;
    return { Authorization: bearer, Authentication: bearer };
  }

  try {
    const token = await getSecretString(tokenSecretId);
    const bearer = `Bearer ${token}`;
    return { Authorization: bearer, Authentication: bearer };
  } catch (err: any) {
    logger.warn("Failed to read token from Secrets Manager", {
      secretId: tokenSecretId,
      errorName: err?.name,
      errorMessage: err?.message,
    });
    return {};
  }
}
