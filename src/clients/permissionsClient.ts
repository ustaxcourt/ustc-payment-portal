import type { ClientPermission } from "@appTypes/ClientPermission";
import { ForbiddenError } from "@errors/forbidden";
import { ServerError } from "@errors/serverError";
import { LOCAL_DEV_ROLE_ARN } from "../extractCallerArn";
import { getSecretString } from "./secretsClient";

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
		allowedFeeKeys: ["*"], // Wildcard: allow all fee keys in local dev
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
		const raw: unknown[] = JSON.parse(secretValue);

		// Validate the structure
		if (!Array.isArray(raw)) {
			throw new Error("Client permissions must be an array");
		}

		type RawPermission = {
			clientName?: unknown;
			clientRoleArn?: unknown;
			allowedFeeKeys?: unknown;
			allowedFeeIds?: unknown;
		};

		for (const entry of raw) {
			const perm = entry as RawPermission;
			// Backward compat: secrets may still use allowedFeeIds (pre-PAY-284 name).
			// Coerce to allowedFeeKeys so the rest of the codebase sees the canonical field.
			if (Array.isArray(perm.allowedFeeIds) && !perm.allowedFeeKeys) {
				perm.allowedFeeKeys = perm.allowedFeeIds;
				delete perm.allowedFeeIds;
			}
			if (
				!perm.clientName ||
				!perm.clientRoleArn ||
				!Array.isArray(perm.allowedFeeKeys)
			) {
				throw new Error("Invalid client permission structure");
			}
		}

		const permissions = raw as ClientPermission[];

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
): Promise<ClientPermission> => {
	const permissions = await getClientPermissions();
	const client = permissions.find((p) => p.clientRoleArn === roleArn) || null;
	if (!client) {
		throw new ForbiddenError("Client not registered");
	}
	return client;
};

/**
 * Clears the permissions cache. Useful for testing.
 */
export const clearPermissionsCache = (): void => {
	cache = null;
};
