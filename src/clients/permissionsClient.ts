import { getSecretString } from "./secretsClient";
import { ServerError } from "../errors/serverError";
import { LOCAL_DEV_ROLE_ARN } from "../extractCallerArn";
import { ClientPermission } from "../types/ClientPermission";

/**
 * Cache for client permissions to avoid per-request Secrets Manager calls.
 * Cache is invalidated after TTL expires.
 */
interface PermissionsCache {
  permissions: ClientPermission[];
  expiresAt: number;
}

let cache: PermissionsCache | null = null;

/** Cache TTL in milliseconds (default: 5 minutes) */
const DEFAULT_CACHE_TTL_MS = 300000;
const parsedCacheTtlMs = parseInt(
  process.env.CLIENT_PERMISSIONS_CACHE_TTL_MS || `${DEFAULT_CACHE_TTL_MS}`,
  10,
);
const CACHE_TTL_MS = Number.isFinite(parsedCacheTtlMs)
  ? parsedCacheTtlMs
  : DEFAULT_CACHE_TTL_MS;

/**
 * Mock client permissions for local development.
 * Allows any feeId for the local dev role.
 */
const LOCAL_DEV_PERMISSIONS: ClientPermission[] = [
  {
    clientName: "Local Development",
    clientRoleArn: LOCAL_DEV_ROLE_ARN,
    allowedFeeIds: ["*"], // Wildcard: allow all feeIds in local dev
  },
];

/**
 * Fetches client permissions from Secrets Manager with caching.
 *
 * In local development (LOCAL_DEV=true), returns mock permissions.
 *
 * @returns Array of client permissions
 * @throws ServerError if unable to fetch or parse permissions
 */
export const getClientPermissions = async (): Promise<ClientPermission[]> => {
  // Bypass for local development
  if (process.env.LOCAL_DEV === "true") {
    return LOCAL_DEV_PERMISSIONS;
  }

  // Return cached value if not expired
  if (cache && Date.now() < cache.expiresAt) {
    return cache.permissions;
  }

  const secretId = process.env.CLIENT_PERMISSIONS_SECRET_ID;
  if (!secretId) {
    throw new ServerError(
      "CLIENT_PERMISSIONS_SECRET_ID environment variable not set",
    );
  }

  try {
    const secretValue = await getSecretString(secretId);
    const permissions: ClientPermission[] = JSON.parse(secretValue);

    // Validate the structure
    if (!Array.isArray(permissions)) {
      throw new Error("Client permissions must be an array");
    }

    for (const perm of permissions) {
      if (
        !perm.clientName ||
        !perm.clientRoleArn ||
        !Array.isArray(perm.allowedFeeIds)
      ) {
        throw new Error("Invalid client permission structure");
      }
    }

    // Update cache
    cache = {
      permissions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return permissions;
  } catch (error) {
    console.error(
      "Failed to fetch client permissions from Secrets Manager",
      error,
    );
    throw new ServerError("Failed to fetch client permissions");
  }
};

/**
 * Looks up a client by their IAM role ARN.
 *
 * @param roleArn - The IAM role ARN to look up
 * @returns The client's permissions, or null if not found
 */
export const getClientByRoleArn = async (
  roleArn: string,
): Promise<ClientPermission | null> => {
  const permissions = await getClientPermissions();
  return permissions.find((p) => p.clientRoleArn === roleArn) || null;
};

/**
 * Clears the permissions cache. Useful for testing.
 */
export const clearPermissionsCache = (): void => {
  cache = null;
};
