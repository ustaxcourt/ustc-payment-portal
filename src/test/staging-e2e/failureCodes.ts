export const FAILURE_CODES = {
  ENV_MISSING: "ENV_MISSING",
  INIT_FAILED: "INIT_FAILED",
  INIT_BAD_REDIRECT: "INIT_BAD_REDIRECT",
  PAYGOV_NAV_FAILED: "PAYGOV_NAV_FAILED",
  PAYGOV_FORM_FAILED: "PAYGOV_FORM_FAILED",
  PAYGOV_SUBMIT_FAILED: "PAYGOV_SUBMIT_FAILED",
  PROCESS_FAILED: "PROCESS_FAILED",
  DETAILS_MISMATCH: "DETAILS_MISMATCH",
  UNEXPECTED: "UNEXPECTED",
} as const;

export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];

export type StagingE2EStep =
  | "config"
  | "init"
  | "paygov"
  | "process"
  | "details"
  | "done"
  | "unknown";

export type FailureLogContext = {
  httpStatus?: number;
  message?: string;
  step?: StagingE2EStep;
  token?: string;
  transactionReferenceId?: string;
};

export class StagingE2EError extends Error {
  public readonly code: FailureCode;
  public readonly httpStatus?: number;
  public readonly step?: StagingE2EStep;
  public readonly token?: string;
  public readonly transactionReferenceId?: string;

  public constructor(
    code: FailureCode,
    message: string,
    context: FailureLogContext = {},
  ) {
    super(message);
    this.name = "StagingE2EError";
    this.code = code;
    this.httpStatus = context.httpStatus;
    this.step = context.step;
    this.token = context.token;
    this.transactionReferenceId = context.transactionReferenceId;
  }
}

export const redactToken = (token?: string): string | undefined => {
  if (!token) {
    return undefined;
  }

  return token.length <= 4 ? "[redacted]" : `...[${token.slice(-4)}]`;
};

export const isStagingE2EError = (value: unknown): value is StagingE2EError =>
  value instanceof StagingE2EError;

export const toStagingE2EError = (
  value: unknown,
  fallback: {
    code: FailureCode;
    message: string;
    step: StagingE2EStep;
    httpStatus?: number;
    token?: string;
    transactionReferenceId?: string;
  },
): StagingE2EError => {
  if (isStagingE2EError(value)) {
    return value;
  }

  if (value instanceof Error) {
    return new StagingE2EError(fallback.code, value.message, fallback);
  }

  return new StagingE2EError(fallback.code, fallback.message, fallback);
};

export const logFailureCode = (
  code: FailureCode,
  context: FailureLogContext = {},
): void => {
  console.error(`STAGING_E2E_FAILURE_CODE=${code}`);

  if (context.step) {
    console.error(`step=${context.step}`);
  }

  if (context.transactionReferenceId) {
    console.error(`transactionReferenceId=${context.transactionReferenceId}`);
  }

  const redactedToken = redactToken(context.token);
  if (redactedToken) {
    console.error(`token=${redactedToken}`);
  }

  if (typeof context.httpStatus === "number") {
    console.error(`httpStatus=${context.httpStatus}`);
  }

  if (context.message) {
    console.error(`message=${context.message}`);
  }
};

export const logStep = (
  step: Exclude<StagingE2EStep, "config" | "unknown">,
) => {
  console.log(`STAGING_E2E_STEP=${step}`);
};
