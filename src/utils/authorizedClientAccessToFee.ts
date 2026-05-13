import { ClientPermission } from "../types/ClientPermission";

export const authorizedClientAccessToFee = (
  client: ClientPermission,
  feeId: string,
): boolean => {
  return (
    client.allowedFeeIds.includes("*") || client.allowedFeeIds.includes(feeId)
  );
};
