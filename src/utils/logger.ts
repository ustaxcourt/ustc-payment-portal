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

const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "password",
  "secret",
  "certpassphrase",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        return [key, "[Redacted]"];
      }

      return [key, redactSensitiveFields(nestedValue)];
    }),
  );
}

function resolveNodeEnv(raw?: string): RuntimeEnv {
  const normalizedEnv = raw?.toLowerCase();

  if (
    normalizedEnv === "local" ||
    normalizedEnv === "test" ||
    normalizedEnv === "development" ||
    normalizedEnv === "staging" ||
    normalizedEnv === "production"
  ) {
    return normalizedEnv;
  }

  if (raw) {
    process.stderr.write(
      `[logger] Invalid NODE_ENV="${raw}"; falling back to development\n`,
    );
  }

  return "development";
}

function resolveLogLevel(
  runtimeEnv: RuntimeEnv,
  configuredLevel?: string,
): string {
  const normalizedLevel = configuredLevel?.toLowerCase();

  if (normalizedLevel && VALID_LEVELS.has(normalizedLevel)) {
    return normalizedLevel;
  }

  if (
    configuredLevel &&
    (!normalizedLevel || !VALID_LEVELS.has(normalizedLevel))
  ) {
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
  hooks: {
    logMethod(inputArgs, method) {
      method.apply(
        this,
        inputArgs.map((arg) => redactSensitiveFields(arg)) as Parameters<
          typeof method
        >,
      );
    },
  },
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
        stage: process.env.APP_ENV || "unknown",
      },
  // Redact sensitive keys before serialization.
  redact: {
    paths: [
      "authorization",
      "*.authorization",
      "token",
      "*.token",
      "password",
      "*.password",
      "secret",
      "*.secret",
      "certPassphrase",
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
