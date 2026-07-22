import { FeeConfigurationError } from "@errors/feeConfiguration";
import { FeeNotFoundError } from "@errors/feeNotFound";

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
    tcsAppId: "TCSUSTAXCOURTANAEF", // TODO: This is a placeholder value; the actual TCS app ID is TBD
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
 * Throws `FeeNotFoundError` when no fee version matches the lookup parameters,
 * and `FeeConfigurationError` when a configured fee is malformed. Defaults to
 * "now" when no date is supplied.
 *
 * Accepts either an ISO 8601 string or a `Date`. Objection/pg return
 * `timestamptz` columns as `Date` objects at runtime even though our model
 * types annotate them as `string`, so we coerce here rather than force every
 * caller to normalise.
 */
export const getActiveFee = (fee: string, date?: string | Date): ActiveFee => {
  const resolutionDate = date ?? new Date();
  const dateMs =
    typeof resolutionDate === "string"
      ? Date.parse(resolutionDate)
      : resolutionDate.getTime();
  if (Number.isNaN(dateMs)) {
    throw new FeeNotFoundError(fee, date);
  }

  const definition = staticFees[fee];
  if (!definition) {
    throw new FeeNotFoundError(fee, date);
  }
  if (!definition.tcsAppId) {
    throw new FeeConfigurationError(fee, "tcsAppId is required");
  }

  const activeVersion = [...definition.versions]
    .map((v) => {
      const activationMs = Date.parse(v.activationDate);
      if (Number.isNaN(activationMs)) {
        throw new FeeConfigurationError(
          fee,
          `Invalid activationDate '${v.activationDate}'`,
        );
      }
      return {
        ...v,
        activationMs,
      };
    })
    .filter((v) => {
      return v.activationMs <= dateMs;
    })
    .sort((a, b) => b.activationMs - a.activationMs)[0];

  if (!activeVersion) {
    throw new FeeNotFoundError(fee, date);
  }

  if (
    !activeVersion.isVariable &&
    (activeVersion.amount === null || activeVersion.amount === undefined)
  ) {
    throw new FeeConfigurationError(
      fee,
      "A fixed fee version must define an amount",
    );
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
