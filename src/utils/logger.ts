import pino from "pino";

type RuntimeEnv = "local" | "test" | "development" | "staging" | "production";

const VALID_LEVELS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);

const DEFAULT_LEVEL_BY_ENV: Record<RuntimeEnv, string> = {
  local: "info",
  test: "error",
  development: "debug",
  staging: "info",
  production: "info",
};

function resolveNodeEnv(raw?: string): RuntimeEnv {
  if (
    raw === "local" ||
    raw === "test" ||
    raw === "development" ||
    raw === "staging" ||
    raw === "production"
  ) {
    return raw;
  }
  return "development";
}

function resolveLogLevel(
  runtimeEnv: RuntimeEnv,
  configuredLevel?: string,
): string {
  if (configuredLevel && VALID_LEVELS.has(configuredLevel)) {
    return configuredLevel;
  }

  if (configuredLevel && !VALID_LEVELS.has(configuredLevel)) {
    // One startup warning if LOG_LEVEL is invalid.
    process.stderr.write(
      `[logger] Invalid LOG_LEVEL="${configuredLevel}"; falling back to ${DEFAULT_LEVEL_BY_ENV[runtimeEnv]}\n`,
    );
  }

  return DEFAULT_LEVEL_BY_ENV[runtimeEnv];
}

const nodeEnv = resolveNodeEnv(process.env.NODE_ENV);
const level = resolveLogLevel(nodeEnv, process.env.LOG_LEVEL);

const usePretty = nodeEnv === "local" || nodeEnv === "development";

export const logger = pino({
  level,
  // Emit string level labels ("info") instead of numbers (30) in JSON output.
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // Use ISO timestamp for CloudWatch compatibility.
  timestamp: pino.stdTimeFunctions.isoTime,
  // Suppress pid/hostname in deployed environments to reduce noise.
  base: usePretty
    ? { pid: process.pid }
    : {
        service: "ustc-payment-portal",
        nodeEnv,
        stage: process.env.STAGE || "unknown",
      },
  // Redact sensitive keys before serialization.
  redact: {
    paths: [
      "authorization",
      "*.token",
      "*.password",
      "*.secret",
      "*.certPassphrase",
    ],
    censor: "[Redacted]",
  },
  // Route to pino-pretty for local/development, raw stdout otherwise.
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

// Add global context when not using pretty (base already included above for pretty).
// For staging/production, default meta is embedded in the base option above.

export function createRequestLogger(context: {
  awsRequestId?: string;
  path?: string;
  httpMethod?: string;
  clientArn?: string;
  transactionReferenceId?: string;
}) {
  return logger.child(context);
}
