import { buildUniqueRunEmail, getStagingE2EConfig } from "./config";
import { FAILURE_CODES, isStagingE2EError } from "./failureCodes";

const REQUIRED_ENV = {
  BASE_URL: "https://api.example.com/stg",
  PAYGOV_QA_CC_SUCCESS_NAME: "Staging E2E",
  PAYGOV_QA_CC_SUCCESS_PAN: process.env.PAYGOV_QA_CC_SUCCESS_PAN,
  PAYGOV_QA_CC_SUCCESS_EXP: process.env.PAYGOV_QA_CC_SUCCESS_EXP ?? "12/34",
  PAYGOV_QA_CC_SUCCESS_CVV: process.env.PAYGOV_QA_CC_SUCCESS_CVV ?? "111",
} as const;

const OPTIONAL_ENV_KEYS = [
  "PAYGOV_QA_CC_SUCCESS_NAME",
  "PAYGOV_URL_SUCCESS",
  "PAYGOV_URL_CANCEL",
] as const;

describe("buildUniqueRunEmail", () => {
  it("produces a unique, well-formed address", () => {
    const first = buildUniqueRunEmail();
    const second = buildUniqueRunEmail();

    expect(first).toMatch(/^staging-e2e-[0-9a-f-]+@example\.com$/);
    expect(first).not.toBe(second);
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
    expect(config.metadata.email).toMatch(/@example\.com$/);
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
