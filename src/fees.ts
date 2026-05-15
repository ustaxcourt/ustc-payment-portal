import { FeeKey } from "./schemas/FeeKey.schema";

export type FeeConfig = {
  feeKey: FeeKey;
  tcsAppId: string;
  amount: number;
  isVariable: boolean;
};

// Superseded by FeesModel.getActiveFeeByKey — kept for reference only.
// The tcsAppId value is provided by Pay.gov during onboarding. See docs/client-onboarding.md.
const fees: FeeConfig[] = [
  {
    feeKey: "PETITION_FILING_FEE",
    tcsAppId: "TCSUSTAXCOURTPETITION",
    amount: 60,
    isVariable: false,
  },
  {
    feeKey: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    tcsAppId: "TCSUSTAXCOURTANAEF",
    amount: 250,
    isVariable: false,
  },
];

export const getFeeConfig = async (feeKey: FeeKey): Promise<FeeConfig | undefined> =>
  fees.find((f) => f.feeKey === feeKey);
