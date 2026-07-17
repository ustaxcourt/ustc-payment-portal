export interface StaticFees {
  [fee: string]: FeeDefinition;
}

export interface FeeDefinition {
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

/**
 * Fee resolved for a specific point in time. Merges the shared definition
 * (`name`, `tcsAppId`, `description`) with the version active at the requested
 * date, and includes the stable `fee` key used to look it up.
 */
export type ActiveFee = Omit<FeeDefinition, "versions"> &
  FeeVersion & {
    fee: string;
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
 * Returns all configured fee definitions in the order declared in `staticFees`.
 */
export const getAllFees = (): FeeDefinition[] => {
  return Object.values(staticFees);
};

/**
 * Resolves a fee by its stable key to the version active at the given date.
 * Returns `undefined` when the key is unknown or no version has activated by
 * the given date. Defaults to "now" when no date is supplied.
 */
export const getActiveFee = (
  fee: string,
  dateIsoString: string = new Date().toISOString(),
): ActiveFee | undefined => {
  const definition = staticFees[fee];
  if (!definition) {
    return undefined;
  }

  console.log("debugging the active version for a fee with a dateIsoString", {
    fee,
    dateIsoString,
  });

  const activeVersion = definition.versions
    .filter((v) => v.activationDate <= dateIsoString)
    .sort((a, b) => {
      console.log("debugging", {
        date: a.activationDate,
        comparison: b.activationDate.localeCompare(a.activationDate),
      });
      return b.activationDate.localeCompare(a.activationDate);
    })[0];

  if (!activeVersion) {
    return undefined;
  }

  return {
    fee,
    name: definition.name,
    tcsAppId: definition.tcsAppId,
    description: definition.description ?? null,
    isVariable: activeVersion.isVariable,
    amount: activeVersion.amount ?? null,
    activationDate: activeVersion.activationDate,
  };
};
