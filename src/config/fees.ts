export interface StaticFees {
  [index: string]: Fee;
}

export interface Fee {
  name: string;
  tcsAppId: string;
  description?: string | null;
  versions: FeeVersion[];
}

export type FeeVersion = {
  isVariable: boolean;
  amount?: number | null;
  activationDate: string;
};

export const staticFees: StaticFees = {
  PETITION_FILING_FEE: {
    name: "Petition Filing Fee",
    tcsAppId: "TCSUSTAXCOURTPETITION",
    versions: [
      {
        isVariable: false,
        amount: 60,
        activationDate: "2026-03-05T00:00:00Z",
      },
    ],
    description: "Fee charged for filing a petition with the U.S. Tax Court.",
  },
  NONATTORNEY_EXAM_REGISTRATION_FEE: {
    name: "Non-Attorney Exam Registration Fee",
    tcsAppId: "TCSUSTAXCOURTANAEF",
    versions: [
      {
        isVariable: false,
        amount: 250,
        activationDate: "2026-03-05T00:00:00Z",
      },
    ],
    description:
      "Fee for non-attorneys to register for an examination with the U.S. Tax Court.",
  },
};

/**
 * Returns all configured fees sorted by activationDate descending.
 */
export const getAllFees = (): Fee[] => {
  return Object.values(staticFees);
};

/**
 * Retrieves a fee by its unique versioned identifier (feeId).
 */
export const getFeeById = (feeId: string): Fee | undefined => {
  return Object.values(staticFees).find((f) => f.feeId === feeId);
};

/**
 * Retrieves the currently active version of a fee by its stable key, as of the given date.
 */
export const getActiveFeeByKey = (
  feeKey: string,
  dateIsoString: string = new Date().toISOString(),
): Fee | undefined => {

  if (!staticFees[feeKey]) {
    return undefined;
  }
  constr version = 

  return staticFees[feeKey].versions
    .filter((f) => f.activationDate <= dateIsoString)
    .sort((a, b) => b.activationDate.localeCompare(a.activationDate))[0];
};
