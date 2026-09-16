import type { AppContext } from "@appTypes/AppContext";
import { logError } from "./logError";

describe("logError", () => {
  const makeAppContext = () => {
    const error = jest.fn();
    return {
      appContext: { logger: { error } } as unknown as AppContext,
      error,
    };
  };

  it("logs the message with error fields when no context is given", () => {
    const { appContext, error } = makeAppContext();
    const err = new TypeError("boom");

    logError(appContext, "something failed", err);

    expect(error).toHaveBeenCalledWith("something failed", {
      errorName: "TypeError",
      errorMessage: "boom",
    });
  });

  it("merges caller-provided context with the error fields", () => {
    const { appContext, error } = makeAppContext();
    const err = new Error("db unreachable");

    logError(appContext, "persist failed", err, {
      transactionReferenceId: "ref-1",
      agencyTrackingId: "track-1",
    });

    expect(error).toHaveBeenCalledWith("persist failed", {
      transactionReferenceId: "ref-1",
      agencyTrackingId: "track-1",
      errorName: "Error",
      errorMessage: "db unreachable",
    });
  });

  it("handles non-Error values", () => {
    const { appContext, error } = makeAppContext();

    logError(appContext, "unexpected throw", "raw string", { fee: "AGN" });

    expect(error).toHaveBeenCalledWith("unexpected throw", {
      fee: "AGN",
      errorName: undefined,
      errorMessage: "raw string",
    });
  });
});
