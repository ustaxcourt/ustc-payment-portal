import { ForbiddenError } from "./errors/forbidden";
import { ClientPermission } from "./types/ClientPermission";

/**
 * Validates that the client (identified by IAM role ARN) is registered and,
 * when a feeId is provided, authorized to access that fee type.
 *
 * @param roleArn - The IAM role ARN of the client (from extractCallerArn)
 * @param feeId - The feeId being requested. Only required for initPayment.
 * @throws ForbiddenError if client is not registered or not authorized for the feeId
 */
export const authorizeClient = (
  client: ClientPermission,
  feeId: string,
): boolean => {
  // Check for wildcard permission (used in local dev)
  const isAuthorized =
    client.allowedFeeIds.includes("*") || client.allowedFeeIds.includes(feeId);
  if (isAuthorized) {
    return true;
  }
  // TODO: Use pino logger here once we have a logger instance in this module
  console.info(`Client not authorized for fee`);
  throw new ForbiddenError("Client not authorized for fee");
};
