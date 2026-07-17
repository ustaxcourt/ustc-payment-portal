import { buildUniqueRunEmail, getStagingE2EConfig } from "./config";
import { FAILURE_CODES, isStagingE2EError } from "./failureCodes";

const {
  BASE_URL,
  PAYGOV_QA_CC_EMAIL,
  PAYGOV_QA_CC_SUCCESS_NAME,
  PAYGOV_QA_CC_SUCCESS_PAN,
  PAYGOV_QA_CC_SUCCESS_EXP,
  PAYGOV_QA_CC_SUCCESS_CVV,
} = process.env;

const REQUIRED_ENV = {
  BASE_URL,
  PAYGOV_QA_CC_EMAIL,
  PAYGOV_QA_CC_SUCCESS_NAME,
  PAYGOV_QA_CC_SUCCESS_PAN,
  PAYGOV_QA_CC_SUCCESS_EXP,
  PAYGOV_QA_CC_SUCCESS_CVV,
} as const;

const OPTIONAL_ENV_KEYS = [
  "PAYGOV_QA_CC_SUCCESS_NAME",
  "PAYGOV_URL_SUCCESS",
  "PAYGOV_URL_CANCEL",
] as const;

describe("buildUniqueRunEmail", () => {
  it("formats the email using the transaction reference id", () => {
    const email = buildUniqueRunEmail(
      "staging-e2e@example.com",
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(email).toBe(
      "staging-e2e+123e4567-e89b-12d3-a456-426614174000@example.com",
    );
  });

  it("throws when the base email is invalid", () => {
    expect(() => buildUniqueRunEmail("not-an-email", "txn-123")).toThrow(
      /PAYGOV_QA_CC_EMAIL must be a valid email address/,
    );
  });
});

describe("getStagingE2EConfig", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [...Object.keys(REQUIRED_ENV), ...OPTIONAL_ENV_KEYS]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns a fully-populated config from the required env", () => {
    const config = getStagingE2EConfig();

    expect(config.baseUrl).toBe("https://api.example.com/stg");
    expect(config.feeKey).toBe("NONATTORNEY_EXAM_REGISTRATION_FEE");
    expect(config.card.pan).toBe(REQUIRED_ENV.PAYGOV_QA_CC_SUCCESS_PAN);
    expect(config.card.cardholderName).toBe("Staging E2E");
    expect(config.billing.country).toBe("United States");
    expect(config.metadata.email).toBe(REQUIRED_ENV.PAYGOV_QA_CC_EMAIL);
  });

  it("strips trailing slashes from BASE_URL", () => {
    process.env.BASE_URL = "https://api.example.com/stg///";

    expect(getStagingE2EConfig().baseUrl).toBe("https://api.example.com/stg");
  });

  it("applies default success/cancel URLs when unset", () => {
    const config = getStagingE2EConfig();

    expect(config.urlSuccess).toBe("https://example.com/success");
    expect(config.urlCancel).toBe("https://example.com/cancel");
  });

  it("throws ENV_MISSING when BASE_URL is absent", () => {
    delete process.env.BASE_URL;

    expect.assertions(2);
    try {
      getStagingE2EConfig();
    } catch (error) {
      expect(isStagingE2EError(error)).toBe(true);
      expect((error as { code: string }).code).toBe(FAILURE_CODES.ENV_MISSING);
    }
  });

  it("throws ENV_MISSING when a card secret is absent", () => {
    delete process.env.PAYGOV_QA_CC_SUCCESS_PAN;

    expect(() => getStagingE2EConfig()).toThrow(
      /PAYGOV_QA_CC_SUCCESS_PAN is required/,
    );
  });

  it("throws ENV_MISSING when PAYGOV_QA_CC_EMAIL is absent", () => {
    delete process.env.PAYGOV_QA_CC_EMAIL;

    expect(() => getStagingE2EConfig()).toThrow(
      /PAYGOV_QA_CC_EMAIL is required/,
    );
  });

  it("throws ENV_MISSING when BASE_URL is not a valid URL", () => {
    process.env.BASE_URL = "not-a-url";

    expect.assertions(1);
    try {
      getStagingE2EConfig();
    } catch (error) {
      expect((error as { code: string }).code).toBe(FAILURE_CODES.ENV_MISSING);
    }
  });
});
