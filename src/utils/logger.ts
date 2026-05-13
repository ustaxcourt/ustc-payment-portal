import pino, { LoggerOptions, Logger } from "pino";
import util from "util";

type RuntimeEnv = "test" | "development" | "production";

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
  test: "error",
  development: "debug",
  production: "info",
};

const SENSITIVE_PATHS = [
  "user.token",
  "request.headers.authorization",
  "request.headers.Authorization",
];

// --- Native helpers ---

function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function deepClone<T>(obj: T): T {
  // Node 17+ / modern runtimes
  return structuredClone(obj);
}

function unsetPath(obj: any, path: string) {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current || typeof current !== "object") return;
    current = current[parts[i]];
  }

  if (current && typeof current === "object") {
    delete current[parts[parts.length - 1]];
  }
}

function deepEqual(a: any, b: any): boolean {
  // Simple deep equality (sufficient for logging metadata)
  if (a === b) return true;

  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a == null ||
    b == null
  ) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}

function redactPaths(obj: any) {
  const copy = isPlainObject(obj) ? deepClone(obj) : obj;

  if (!isPlainObject(copy)) return copy;

  for (const path of SENSITIVE_PATHS) {
    unsetPath(copy, path);
  }

  return copy;
}

function removeDuplicateLogInformation(obj: any) {
  if (!isPlainObject(obj)) return obj;

  const copy = deepClone(obj);

  if (!copy.context || !isPlainObject(copy.context)) return copy;

  for (const key of Object.keys(copy.context)) {
    if (deepEqual(copy[key], copy.context[key])) {
      delete copy.context[key];
    }
  }

  return copy;
}

function getMetadataLines(info: any): string[] {
  const metadata = { ...info };
  delete metadata.level;
  delete metadata.msg;
  delete metadata.time;

  const stringified = util.inspect(metadata, {
    compact: false,
    maxStringLength: null,
  });

  const stripped = stringified.replace(/.+: undefined,*/gm, "").trim();

  if (stripped === "{}") return [];

  return stripped.split("\n");
}

// --- ENV helpers ---

function resolveNodeEnv(raw?: string): RuntimeEnv {
  const normalized = raw?.toLowerCase();
  if (
    normalized === "test" ||
    normalized === "development" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return "development";
}

function resolveLogLevel(env: RuntimeEnv, configured?: string): string {
  const normalized = configured?.toLowerCase();
  if (normalized && VALID_LEVELS.has(normalized)) return normalized;
  return DEFAULT_LEVEL_BY_ENV[env];
}

// --- Factory (Pino-style) ---

export function createLogger(opts: LoggerOptions = {}): Logger {
  const nodeEnv = resolveNodeEnv(process.env.NODE_ENV);
  const level = resolveLogLevel(nodeEnv, process.env.LOG_LEVEL);

  const usePretty = nodeEnv !== "production";

  const logger = pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,

    formatters: {
      level(label) {
        return { level: label };
      },
    },

    base: {
      ...(opts.base || {}),
    },

    hooks: {
      logMethod(args, method) {
        const processed = args.map((arg) => {
          let value = arg;

          value = redactPaths(value);
          value = removeDuplicateLogInformation(value);

          return value;
        });

        method.apply(this, processed as any);
      },
    },

    serializers: {
      err: (err: any) => ({
        message: err?.message,
        stack: err?.stack,
        ...err,
      }),
    },

    transport: usePretty
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        }
      : undefined,
  });

  (logger as any).warning = logger.warn;

  return logger;
}

// Add global context when not using pretty (base already included above for pretty).
// For staging/production, default meta is embedded in the base option above.

/**
 * Returns the origin (scheme + host + port) of a URL string, or undefined if
 * the URL is absent or unparseable. Use this to log redirect destinations
 * without exposing path or query parameters.
 */
export const getUrlOrigin = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * Returns a sorted list of keys present in a metadata object, or undefined if
 * the value is not a plain object. Use this to log which metadata fields were
 * provided without exposing their values.
 */
export const getMetadataKeys = (metadata: unknown): string[] | undefined => {
  if (!isPlainObject(metadata)) {
    return undefined;
  }
  return Object.keys(metadata).sort();
};
