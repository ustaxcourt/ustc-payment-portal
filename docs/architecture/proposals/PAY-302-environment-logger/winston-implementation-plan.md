# PAY-302: Winston Logging Implementation Plan

## Story Alignment

This plan supports PAY-302 and prepares implementation details needed for PAY-249.

Goals covered by this plan:

- Document Winston as an alternative logging solution considered during evaluation.
- Support environment-based log levels via environment variables.
- Automatically and optionally inject searchable context fields.
- Keep local developer logging useful without flooding output.
- Record implementation findings for comparison with the accepted ADR direction.

## Current State Snapshot (from this repo)

- The codebase currently uses direct `console.log`, `console.warn`, and `console.error` in many runtime paths.
- `NODE_ENV` values already used in code include: `local`, `test`, `development`, `staging`, `production`.
- CI and deployment workflows also use stage-style naming (`dev`, `stg`, `prod`) and PR ephemeral environments.

## Environment Model to Use for Logging

For implementation, treat runtime environments as:

- `local`: local integration and local app execution.
- `test`: unit/integration test runs.
- `development`: default development runtime.
- `staging`: pre-production runtime.
- `production`: production runtime.

Additional deployment context:

- PR ephemeral environments should behave like non-production by default, unless explicitly overridden with `LOG_LEVEL`.
- If a stage variable exists (`APP_ENV=dev|stg|prod`), include it in log context, but keep `NODE_ENV` as the primary runtime switch for logger defaults.

## Proposed Winston Design

### 1) Base Logger Module

Create a centralized logger module at `src/utils/logger.ts`.

Responsibilities:

- Build one Winston logger instance.
- Resolve effective log level from environment.
- Define standard JSON structure for deployed environments.
- Define concise, colorized format for local development.
- Export typed helpers for child/context loggers.

Recommended packages:

- `winston`

Optional package (if desired for local readability):

- `winston-format` (not required; Winston built-in formatters are usually enough)

### 2) Log Level Resolution

Use this precedence:

1. `LOG_LEVEL` (explicit override in any environment)
2. Environment default by `NODE_ENV`

Recommended defaults:

- `local` -> `info`
- `test` -> `error` (reduce noise in test output)
- `development` -> `debug`
- `staging` -> `info`
- `production` -> `info`

Validation behavior:

- If `LOG_LEVEL` is set to an invalid value, fallback to environment default and emit one startup warning.

Supported levels:

- `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`

### 3) Output Formats by Environment

`local` and `development`:

- Human-readable, colorized, single-line where possible.
- Include timestamp, level, message, and compact context fields.

`test`:

- Minimal output.
- Keep level at `error` by default unless `LOG_LEVEL` is overridden.

`staging` and `production`:

- Structured JSON logs for CloudWatch queryability.
- Include stable keys (see context schema below).

### 4) Context Injection Strategy

Automatic context (added globally by logger setup):

- `service`: `ustc-payment-portal`
- `nodeEnv`: from `NODE_ENV`
- `stage`: from `APP_ENV` when present
- `version`: from package version (optional, but useful)

Request context (attached per request/handler):

- `awsRequestId`
- `path`
- `httpMethod`
- `clientArn` (if available after auth extraction)
- `transactionReferenceId` (when present)

Domain context (optional via child logger):

- `feeId`
- `paygovTrackingId`
- `paymentStatus`

Implementation approach:

- Use `logger.child({ ...context })` to inject context once per request/use-case.
- Avoid manually concatenating IDs into message strings when they can be fields.

### 5) Sensitive Data Rules

Never log:

- Full SOAP payloads with sensitive fields
- Tokens, secrets, passphrases, credentials
- Full PII payloads

Add a redaction helper in logger module for known keys:

- `authorization`
- `token`
- `password`
- `secret`
- `certPassphrase`

## Sample Script: Winston Initialization and Environment Usage

Use this as a reference implementation for `src/utils/logger.ts`.

```ts
import { createLogger, format, transports } from "winston";

type RuntimeEnv = "local" | "test" | "development" | "staging" | "production";

const VALID_LEVELS = new Set([
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
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
  nodeEnv: RuntimeEnv,
  configuredLevel?: string,
): string {
  if (configuredLevel && VALID_LEVELS.has(configuredLevel)) {
    return configuredLevel;
  }

  if (configuredLevel && !VALID_LEVELS.has(configuredLevel)) {
    // One startup warning if LOG_LEVEL is invalid.
    process.stderr.write(
      `[logger] Invalid LOG_LEVEL="${configuredLevel}"; falling back to ${DEFAULT_LEVEL_BY_ENV[nodeEnv]}\n`,
    );
  }

  return DEFAULT_LEVEL_BY_ENV[nodeEnv];
}

const nodeEnv = resolveNodeEnv(process.env.NODE_ENV);
const level = resolveLogLevel(nodeEnv, process.env.LOG_LEVEL);

const prettyFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ timestamp, level: lvl, message, ...meta }) => {
    const metaPart = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${lvl}: ${message}${metaPart}`;
  }),
);

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json(),
);

export const logger = createLogger({
  level,
  defaultMeta: {
    service: "ustc-payment-portal",
    nodeEnv,
    stage: process.env.APP_ENV,
  },
  format:
    nodeEnv === "staging" || nodeEnv === "production"
      ? jsonFormat
      : prettyFormat,
  transports: [new transports.Console()],
});

export function createRequestLogger(context: {
  awsRequestId?: string;
  path?: string;
  httpMethod?: string;
  clientArn?: string;
  transactionReferenceId?: string;
}) {
  return logger.child(context);
}
```

Usage example in a handler/use-case:

```ts
import { logger, createRequestLogger } from "./utils/logger";

export async function exampleHandler(event: any) {
  const requestLogger = createRequestLogger({
    awsRequestId: event?.requestContext?.requestId,
    path: event?.path,
    httpMethod: event?.httpMethod,
  });

  requestLogger.info("Request started");

  try {
    // Example domain context for searchability.
    requestLogger.info("Payment initiated", {
      feeId: "FEE-001",
      transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    requestLogger.error("Request failed", { err });
    throw err;
  }
}
```

Run examples for different environments:

```bash
# local default: info
NODE_ENV=local npm run start

# test default: error (quiet)
NODE_ENV=test npm test

# development default: debug
NODE_ENV=development npm run dev

# staging default: info JSON
NODE_ENV=staging npm run start

# production default: info JSON
NODE_ENV=production npm run start

# override in any environment
NODE_ENV=production LOG_LEVEL=debug npm run start
```

Expected behavior summary:

- `LOG_LEVEL` always wins when valid.
- Invalid `LOG_LEVEL` falls back to environment defaults.
- `local` and `development` produce readable console output.
- `staging` and `production` produce JSON logs suitable for CloudWatch queries.
- `test` remains low-noise unless explicitly overridden.

## Sample Output: How Logs Will Look

### Local/Development (pretty, colorized)

Example `info` log:

```text
2026-04-29T14:38:41.125Z info: Request started {"service":"ustc-payment-portal","nodeEnv":"local","stage":"dev","awsRequestId":"1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad","path":"/transactions","httpMethod":"POST"}
```

Example `error` log:

```text
2026-04-29T14:38:41.499Z error: Request failed {"service":"ustc-payment-portal","nodeEnv":"development","stage":"dev","awsRequestId":"1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad","transactionReferenceId":"8d537be3-80e8-41a3-8acd-8d44cc2a7183","err":{"name":"InvalidRequestError","message":"missing body"}}
```

### Staging/Production (JSON)

Example `info` log:

```json
{
  "level": "info",
  "message": "Payment initiated",
  "timestamp": "2026-04-29T14:40:08.810Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "staging",
  "stage": "stg",
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "path": "/payments/init",
  "httpMethod": "POST",
  "clientArn": "arn:aws:iam::123456789012:role/example-client",
  "feeId": "FEE-001",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
}
```

Example `error` log with stack:

```json
{
  "level": "error",
  "message": "Request failed",
  "timestamp": "2026-04-29T14:40:09.091Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "production",
  "stage": "prod",
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  "err": {
    "name": "Error",
    "message": "database timeout",
    "stack": "Error: database timeout\n    at ..."
  }
}
```

### Test (minimal by default)

With `NODE_ENV=test` and no override, only `error` logs should appear. `info` and `debug` logs are suppressed to avoid noisy test output.

```text
2026-04-29T14:41:13.002Z error: Request failed {"service":"ustc-payment-portal","nodeEnv":"test","awsRequestId":"test-run-123","err":{"name":"Error","message":"simulated failure"}}
```

### Field Searchability

In CloudWatch Logs Insights, these fields are directly searchable because they are top-level JSON fields in staging/production logs:

- `level`
- `message`
- `service`
- `nodeEnv`
- `stage`
- `awsRequestId`
- `transactionReferenceId`
- `feeId`
- `clientArn`

## Implementation Steps

### Phase 1: Foundation

1. Add Winston dependency.
2. Create `src/utils/logger.ts` with:
   - environment-aware level resolution
   - per-environment format selection
   - base metadata
   - `createRequestLogger(context)` helper
3. Add logger unit tests in `src/utils/logger.test.ts` for:
   - level selection precedence
   - invalid `LOG_LEVEL` fallback behavior
   - context merge behavior

### Phase 2: Runtime Integration

1. Replace direct console usage in core runtime paths first:
   - handlers (`src/lambdaHandler.ts`)
   - error handling (`src/handleError.ts`)
   - app context / outbound calls (`src/appContext.ts`)
   - core use cases (`src/useCases/*` high-traffic paths)
2. Keep migration focused:
   - preserve existing message intent
   - convert string interpolation to structured fields where possible
3. Keep developer tooling scripts (for now) on console if they are not part of runtime critical path.

### Phase 3: Request Context Wiring

1. In Lambda request entry points, create child logger with request context.
2. Pass request-scoped logger through app/use-case call chain (or attach to app context).
3. Ensure each error log includes enough fields for search without dumping full objects.

### Phase 4: Configuration and Docs

1. Document new environment variables in README:
   - `LOG_LEVEL`
   - optional `LOG_FORMAT` (if implemented)
2. Add `.env.example` entries for local/test defaults.
3. Update local run docs to show how to tune verbosity.

### Phase 5: Validation

1. Unit tests pass with default test log suppression.
2. Integration test output remains readable (no buffer flooding).
3. Validate logs in deployed non-prod environment are queryable JSON with expected fields.

## Suggested Environment Defaults

| Environment | Default Level | Format           | Notes                                     |
| ----------- | ------------- | ---------------- | ----------------------------------------- |
| local       | info          | pretty/colorized | Good local signal without excessive noise |
| test        | error         | minimal          | Reduces test output noise                 |
| development | debug         | pretty/colorized | Useful during feature work                |
| staging     | info          | JSON             | Mirrors prod observability                |
| production  | info          | JSON             | Stable baseline for operations            |

Override in any environment:

- Set `LOG_LEVEL=debug` (or other valid level) when deeper troubleshooting is needed.

## ADR Plan

Draft an ADR under `docs/architecture/decisions/` (next available number) covering:

- Decision: Adopt Winston as standard logging library.
- Why: structured logs, level controls, context support, ecosystem maturity.
- Alternatives considered: Pino, Bunyan (or equivalent shortlist used in PAY-302 research).
- Consequences: migration effort, dependency footprint, log format standardization.

Review checklist:

- Team review in architecture sync.
- Confirm default levels by environment.
- Confirm required context keys and redaction policy.
- Confirm rollout scope for PAY-249 dependencies.

## Definition of Done for PAY-302 Logging Setup

- Winston logger module is implemented and tested.
- Core runtime paths use Winston instead of direct console logging.
- Environment-based level behavior works and is documented.
- Request/context enrichment works for searchability.
- Local/test output remains manageable.
- ADR is drafted and reviewed.
