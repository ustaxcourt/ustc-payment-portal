import { FeeConfigurationError } from "@errors/feeConfiguration";

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
 * Throws `FeeConfigurationError` when the key is unknown, the date is invalid,
 * or no version has activated by the given date. Defaults to "now" when no
 * date is supplied.
 *
 * Accepts either an ISO 8601 string or a `Date`. Objection/pg return
 * `timestamptz` columns as `Date` objects at runtime even though our model
 * types annotate them as `string`, so we coerce here rather than force every
 * caller to normalise.
 */
export const getActiveFee = (
  fee: string,
  date: string | Date = new Date(),
): ActiveFee => {
  const dateMs = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (Number.isNaN(dateMs)) {
    throw new FeeConfigurationError(fee);
  }

  const definition = staticFees[fee];
  if (!definition) {
    throw new FeeConfigurationError(fee);
  }
  if (!definition.tcsAppId) {
    throw new FeeConfigurationError(fee);
  }

  const activeVersion = [...definition.versions]
    .filter((v) => {
      const activationMs = Date.parse(v.activationDate);
      return !Number.isNaN(activationMs) && activationMs <= dateMs;
    })
    .sort(
      (a, b) => Date.parse(b.activationDate) - Date.parse(a.activationDate),
    )[0];

  if (!activeVersion) {
    throw new FeeConfigurationError(fee);
  }

  if (
    !activeVersion.isVariable &&
    (activeVersion.amount === null || activeVersion.amount === undefined)
  ) {
    throw new FeeConfigurationError(fee);
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
