import { FeeId } from "./schemas/FeeId.schema";

export type FeeConfig = {
  feeId: FeeId;
  feeName: string;
  tcsAppId: string;
  amount: number;
  isVariable: boolean;
};

// TODO: replace with DB lookup once fees table is provisioned.
// To add a new fee type: add an entry here and redeploy.
// The tcsAppId value is provided by Pay.gov during onboarding. See docs/client-onboarding.md.
const fees: FeeConfig[] = [
  {
    feeId: "PETITION_FILING_FEE",
    feeName: "Petition Filing Fee",
    tcsAppId: "TCSUSTAXCOURTPETITION",
    amount: 60,
    isVariable: false,
  },
  {
    feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    feeName: "Non-Attorney Exam Registration Fee",
    tcsAppId: "TCSUSTAXCOURTANAEF",
    amount: 250,
    isVariable: false,
  },
];

export const getFeeConfig = async (feeId: FeeId): Promise<FeeConfig | undefined> =>
  fees.find((f) => f.feeId === feeId);
