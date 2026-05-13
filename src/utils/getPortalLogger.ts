import { createLogger } from "../utils/logger";
import { AuthContext } from "../types/AuthContext";
import { LoggerType } from "../types/LoggerType";

let loggerCache: LoggerType;

export const getPortalLogger = (): LoggerType => {
  if (!loggerCache) {
    const baseLogger = createLogger();

    // Holds accumulated context
    let currentContext: Record<string, any> = {};

    // Always derive a fresh child when logging
    const getLoggerWithContext = () => {
      return Object.keys(currentContext).length
        ? baseLogger.child(currentContext)
        : baseLogger;
    };

    loggerCache = {
      addContext: (newMeta: Record<string, any>) => {
        currentContext = {
          ...currentContext,
          ...newMeta,
        };
      },

      addUser: ({ user }: { user: AuthContext }) => {
        currentContext = {
          ...currentContext,
          user,
        };
      },

      clearContext: () => {
        currentContext = {};
      },

      getContext: () => currentContext,

      debug: (message: string, context: Record<string, unknown> = {}) =>
        getLoggerWithContext().debug({ context }, message),

      info: (message: string, context: Record<string, unknown> = {}) =>
        getLoggerWithContext().info({ context }, message),

      warn: (message: string, context: Record<string, unknown> = {}) =>
        getLoggerWithContext().warn({ context }, message),

      error: (message: string, context: Record<string, unknown> = {}) =>
        getLoggerWithContext().error({ context }, message),
    };
  }

  return loggerCache;
};
