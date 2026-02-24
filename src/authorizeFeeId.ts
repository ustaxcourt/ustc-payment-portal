import { ForbiddenError } from "./errors/forbidden";
import { getClientByRoleArn } from "./clients/clientPermissionsClient";

/**
 * Validates that the client (identified by IAM role ARN) is authorized
 * to access the requested feeId.
 *
 * @param roleArn - The IAM role ARN of the client (from authorizeRequest)
 * @param feeId - The feeId being requested
 * @throws ForbiddenError if client is not registered or not authorized for the feeId
 */
export const authorizeFeeId = async (
  roleArn: string,
  feeId: string
): Promise<void> => {
  const client = await getClientByRoleArn(roleArn);

  if (!client) {
    throw new ForbiddenError("Client not registered");
  }

  // Check for wildcard permission (used in local dev)
  if (client.allowedFeeIds.includes("*")) {
    return;
  }

  if (!client.allowedFeeIds.includes(feeId)) {
    throw new ForbiddenError("Client not authorized for feeId");
  }
};

