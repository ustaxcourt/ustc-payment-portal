import { ClientPermission } from "../types/ClientPermission";

export const canClientAccessFee = (
  client: ClientPermission,
  feeId: string,
): boolean => {
  return (
    client.allowedFeeIds.includes("*") || client.allowedFeeIds.includes(feeId)
  );
};
