import { ForbiddenError } from "@errors/forbidden";
import type { ClientPermission } from "@appTypes/ClientPermission";
import { logger } from "@utils/logger";

/**
 * Validates that the client is authorized to access the given fee key.
 *
 * @param client - The resolved client permission record
 * @param feeKey - The fee key being requested
 * @throws ForbiddenError if client is not authorized for the fee key
 */
export const authorizeClient = (
	client: ClientPermission,
	feeKey: string,
): boolean => {
	// Check for wildcard permission (used in local dev)
	const isAuthorized =
		client.allowedFeeKeys.includes("*") ||
		client.allowedFeeKeys.includes(feeKey);
	if (isAuthorized) {
		return true;
	}
	logger.info(`Client not authorized for fee`);
	throw new ForbiddenError("Client not authorized for fee");
};
