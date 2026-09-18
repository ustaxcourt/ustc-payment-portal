import type { AppContext } from "@appTypes/AppContext";

export const logError = (
  appContext: AppContext,
  message: string,
  err: unknown,
  context?: Record<string, unknown>,
): void => {
  appContext.logger.error(message, {
    ...context,
    errorName: err instanceof Error ? err.name : undefined,
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined,
  });
};
