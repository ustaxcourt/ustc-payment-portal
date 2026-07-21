import {
  FAILURE_CODES,
  StagingE2EError,
  isStagingE2EError,
  redactToken,
  toStagingE2EError,
} from "./failureCodes";

describe("StagingE2EError", () => {
  it("captures the code, name, and optional context", () => {
    const error = new StagingE2EError(FAILURE_CODES.INIT_FAILED, "boom", {
      httpStatus: 502,
      step: "init",
      token: "tok_1234567890",
      transactionReferenceId: "abc-123",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StagingE2EError);
    expect(error.name).toBe("StagingE2EError");
    expect(error.message).toBe("boom");
    expect(error.code).toBe(FAILURE_CODES.INIT_FAILED);
    expect(error.httpStatus).toBe(502);
    expect(error.step).toBe("init");
    expect(error.token).toBe("tok_1234567890");
    expect(error.transactionReferenceId).toBe("abc-123");
  });

  it("defaults context fields to undefined", () => {
    const error = new StagingE2EError(FAILURE_CODES.UNEXPECTED, "no context");

    expect(error.httpStatus).toBeUndefined();
    expect(error.step).toBeUndefined();
    expect(error.token).toBeUndefined();
    expect(error.transactionReferenceId).toBeUndefined();
  });
});

describe("redactToken", () => {
  it("returns undefined when no token is provided", () => {
    expect(redactToken(undefined)).toBeUndefined();
    expect(redactToken("")).toBeUndefined();
  });

  it("fully masks tokens of four characters or fewer", () => {
    expect(redactToken("ab")).toBe("[redacted]");
    expect(redactToken("abcd")).toBe("[redacted]");
  });

  it("keeps only the last four characters of longer tokens", () => {
    expect(redactToken("abcdef")).toBe("...[cdef]");
    expect(redactToken("tok_secret_value_9999")).toBe("...[9999]");
  });
});

describe("isStagingE2EError", () => {
  it("recognizes StagingE2EError instances", () => {
    expect(
      isStagingE2EError(new StagingE2EError(FAILURE_CODES.UNEXPECTED, "x")),
    ).toBe(true);
  });

  it("rejects other values", () => {
    expect(isStagingE2EError(new Error("plain"))).toBe(false);
    expect(isStagingE2EError("string")).toBe(false);
    expect(isStagingE2EError(undefined)).toBe(false);
  });
});

describe("toStagingE2EError", () => {
  const fallback = {
    code: FAILURE_CODES.PROCESS_FAILED,
    message: "fallback message",
    step: "process" as const,
    transactionReferenceId: "ref-1",
  };

  it("returns the original error when it is already a StagingE2EError", () => {
    const original = new StagingE2EError(FAILURE_CODES.INIT_FAILED, "original");

    expect(toStagingE2EError(original, fallback)).toBe(original);
  });

  it("wraps a plain Error, preserving its message and applying fallback context", () => {
    const result = toStagingE2EError(new Error("network down"), fallback);

    expect(result).toBeInstanceOf(StagingE2EError);
    expect(result.message).toBe("network down");
    expect(result.code).toBe(FAILURE_CODES.PROCESS_FAILED);
    expect(result.step).toBe("process");
    expect(result.transactionReferenceId).toBe("ref-1");
  });

  it("uses the fallback message for non-Error values", () => {
    const result = toStagingE2EError("not an error", fallback);

    expect(result).toBeInstanceOf(StagingE2EError);
    expect(result.message).toBe("fallback message");
    expect(result.code).toBe(FAILURE_CODES.PROCESS_FAILED);
  });
});
