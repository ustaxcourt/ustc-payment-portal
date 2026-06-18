import { staticFees } from '../../../src/config/fees';

type FeesRow = {
  fee_id: string;
  fee_key: string;
  name: string;
  tcs_app_id: string;
  is_variable: boolean;
  amount: number;
  description: string;
  activation_date: string;
};

// Insert new fee versions here to get them registered in the DB. Added via seeding.
// Now mapped from the hardcoded fees configuration in the codebase as the single source of truth.
export const generateFees = (): FeesRow[] => {
  return staticFees.map((fee) => ({
    fee_id: fee.feeId,
    fee_key: fee.feeKey,
    name: fee.name,
    tcs_app_id: fee.tcsAppId,
    is_variable: fee.isVariable,
    amount: fee.amount ?? 0,
    description: fee.description ?? '',
    activation_date: fee.activationDate,
  }));
};
