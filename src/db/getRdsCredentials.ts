import { getSecretString } from "../clients/secretsClient";

export interface RdsConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: { rejectUnauthorized: boolean };
}

// Cached per Lambda container lifetime — SecretsManager is only called on cold start.
let cached: RdsConnectionConfig | null = null;

/**
 * Parses "host:port" as output by the Terraform RDS module endpoint.
 * Exported so other modules (e.g. migrationHandler) can reuse it without duplication.
 */
export function parseRdsEndpoint(endpoint: string): { host: string; port: number } {
  const colonIdx = endpoint.lastIndexOf(":");
  if (colonIdx === -1) throw new Error(`RDS_ENDPOINT has unexpected format: "${endpoint}"`);
  const host = endpoint.slice(0, colonIdx);
  const port = parseInt(endpoint.slice(colonIdx + 1), 10);
  if (isNaN(port)) throw new Error(`could not parse port from RDS_ENDPOINT: "${endpoint}"`);
  return { host, port };
}

/**
 * Resolves the RDS connection config from environment variables and SecretsManager.
 * Cached for the Lambda container lifetime — SecretsManager is only called on cold start.
 */
export async function getRdsCredentials(): Promise<RdsConnectionConfig> {
  if (cached) return cached;

  const { RDS_ENDPOINT, RDS_SECRET_ARN, RDS_DB_NAME } = process.env;

  if (!RDS_ENDPOINT) throw new Error("RDS_ENDPOINT is not set");
  if (!RDS_SECRET_ARN) throw new Error("RDS_SECRET_ARN is not set");
  if (!RDS_DB_NAME) throw new Error("RDS_DB_NAME is not set");

  const { host, port } = parseRdsEndpoint(RDS_ENDPOINT);

  const secretJson = await getSecretString(RDS_SECRET_ARN);
  const { username, password } = JSON.parse(secretJson) as { username: string; password: string };

  if (!username) throw new Error("RDS secret is missing 'username' field");
  if (!password) throw new Error("RDS secret is missing 'password' field");

  cached = { host, port, user: username, password, database: RDS_DB_NAME, ssl: { rejectUnauthorized: true } };
  return cached;
}

/** Clears the credential cache. Only used in tests. */
export function _clearRdsCredentialCache(): void {
  cached = null;
}
