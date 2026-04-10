import { ForbiddenError } from "./errors/forbidden";
import { getClientByRoleArn } from "./clients/permissionsClient";
import { ClientPermission } from "./types/ClientPermission";

/**
 * Validates that the client (identified by IAM role ARN) is registered and,
 * when a feeId is provided, authorized to access that fee type.
 *
 * @param roleArn - The IAM role ARN of the client (from extractCallerArn)
 * @param feeId - The feeId being requested. Only required for initPayment.
 * @throws ForbiddenError if client is not registered or not authorized for the feeId
 */
export const authorizeClient = async (
  roleArn: string,
  feeId?: string
): Promise<ClientPermission> => {
  const client = await getClientByRoleArn(roleArn);

  if (!client) {
    throw new ForbiddenError("Client not registered");
  }

  // Exit case if there's no feeId provided - only initPayment requires feeId authorization
  if (feeId === undefined) {
    return client;
  }

  // Check for wildcard permission (used in local dev)
  if (client.allowedFeeIds.includes("*")) {
    return client;
  }

  if (!client.allowedFeeIds.includes(feeId)) {
    throw new ForbiddenError("Client not authorized for feeId");
  }

  return client;
};
