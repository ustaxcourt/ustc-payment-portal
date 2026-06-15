export const FEE_KEYS = [
  'PETITION_FILING_FEE',
  'NONATTORNEY_EXAM_REGISTRATION_FEE',
] as const;

export type FeeKey = typeof FEE_KEYS[number];

export type FeeDefinition = {
  feeId: string;
  feeKey: FeeKey;
  name: string;
  isVariable: boolean;
  amount: number | null;
  description: string;
  activationDate: string;
};

export type ResolvedFee = FeeDefinition & { tcsAppId: string };

// Keyed by feeId. Old entries must never be removed — past transactions reference
// them by feeId. When a fee changes, add a new entry with a new feeId, same feeKey,
// and a later activationDate. The entry with the latest activationDate <= now wins.
export const FEES: Record<string, FeeDefinition> = {
  PETITION_FILING_FEE: {
    feeId: 'PETITION_FILING_FEE',
    feeKey: 'PETITION_FILING_FEE',
    name: 'Petition Filing Fee',
    isVariable: false,
    amount: 60,
    description: 'Fee charged for filing a petition with the U.S. Tax Court.',
    activationDate: '2026-03-05T00:00:00Z',
  },
  NONATTORNEY_EXAM_REGISTRATION_FEE: {
    feeId: 'NONATTORNEY_EXAM_REGISTRATION_FEE',
    feeKey: 'NONATTORNEY_EXAM_REGISTRATION_FEE',
    name: 'Non-Attorney Exam Registration Fee',
    isVariable: false,
    amount: 250,
    description: 'Fee for non-attorneys to register for an examination with the U.S. Tax Court.',
    activationDate: '2026-03-05T00:00:00Z',
  },
};

export function getActiveFeeByKey(feeKey: FeeKey, tcsAppId: string): ResolvedFee | undefined {
  const now = new Date().toISOString();
  const active = Object.values(FEES)
    .filter((f) => f.feeKey === feeKey && f.activationDate <= now)
    .sort((a, b) => b.activationDate.localeCompare(a.activationDate))[0];

  if (!active) return undefined;
  return { ...active, tcsAppId: tcsAppId };
}

export function getFeeById(feeId: string, tcsAppId: string): ResolvedFee | undefined {
  const fee = FEES[feeId];
  if (!fee) return undefined;
  return { ...fee, tcsAppId: tcsAppId };
}
