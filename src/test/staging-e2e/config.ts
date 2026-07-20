import { FAILURE_CODES, StagingE2EError } from "./failureCodes";

const FEE_KEY = "PETITION_FILING_FEE" as const;
const DEFAULT_URL_SUCCESS = "https://example.com/success";
const DEFAULT_URL_CANCEL = "https://example.com/cancel";
const PAY_GOV_HOST = "qa.pay.gov";
const DEFAULT_EMAIL = "staging-e2e@example.com";

// Unique per run — Pay.gov allows one obligation per email.
export const buildUniqueRunEmail = (): string => {
  const [local, domain] = DEFAULT_EMAIL.split("@");
  return `${local}-${crypto.randomUUID()}@${domain}`;
};

export type StagingE2EConfig = {
  baseUrl: string;
  billing: {
    address: string;
    city: string;
    country: string;
    state: string;
    zip: string;
  };
  card: {
    cardholderName: string;
    cvv: string;
    expiration: string;
    pan: string;
  };
  feeKey: typeof FEE_KEY;
  metadata: {
    accessCode: string;
    email: string;
    fullName: string;
  };
  payGovHost: string;
  timeouts: {
    navigationMs: number;
    requestMs: number;
    submitMs: number;
  };
  urlCancel: string;
  urlSuccess: string;
};

const assertUrl = (name: string, value: string): string => {
  try {
    return new URL(value).toString();
  } catch {
    throw new StagingE2EError(
      FAILURE_CODES.ENV_MISSING,
      `${name} must be a valid absolute URL`,
      { step: "config" },
    );
  }
};

const readRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new StagingE2EError(
      FAILURE_CODES.ENV_MISSING,
      `${name} is required for staging Pay.gov E2E tests`,
      { step: "config" },
    );
  }

  return value;
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

export const getStagingE2EConfig = (): StagingE2EConfig => {
  const baseUrl = normalizeBaseUrl(
    assertUrl("BASE_URL", readRequiredEnv("BASE_URL")),
  );
  const urlSuccess = assertUrl(
    "PAYGOV_URL_SUCCESS",
    process.env.PAYGOV_URL_SUCCESS?.trim() || DEFAULT_URL_SUCCESS,
  );
  const urlCancel = assertUrl(
    "PAYGOV_URL_CANCEL",
    process.env.PAYGOV_URL_CANCEL?.trim() || DEFAULT_URL_CANCEL,
  );

  return {
    baseUrl,
    billing: {
      address:
        process.env.PAYGOV_QA_BILLING_ADDRESS?.trim() || "400 Second Street NW",
      city: process.env.PAYGOV_QA_BILLING_CITY?.trim() || "Washington",
      country: process.env.PAYGOV_QA_BILLING_COUNTRY?.trim() || "United States",
      // Full name to match the US State dropdown label (not "DC").
      state:
        process.env.PAYGOV_QA_BILLING_STATE?.trim() || "District of Columbia",
      zip: process.env.PAYGOV_QA_BILLING_ZIP?.trim() || "20217",
    },
    card: {
      pan: readRequiredEnv("PAYGOV_QA_CC_SUCCESS_PAN"),
      expiration: readRequiredEnv("PAYGOV_QA_CC_SUCCESS_EXP"),
      cvv: readRequiredEnv("PAYGOV_QA_CC_SUCCESS_CVV"),
      cardholderName:
        process.env.PAYGOV_QA_CC_SUCCESS_NAME?.trim() || "Staging E2E",
    },
    feeKey: FEE_KEY,
    metadata: {
      email: buildUniqueRunEmail(),
      fullName: "Staging E2E",
      accessCode: "STAGINGE2E",
    },
    payGovHost: PAY_GOV_HOST,
    timeouts: {
      navigationMs: 60_000,
      requestMs: 60_000,
      submitMs: 90_000,
    },
    urlSuccess,
    urlCancel,
  };
};
