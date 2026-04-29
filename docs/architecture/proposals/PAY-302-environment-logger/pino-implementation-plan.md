# PAY-302: Pino Logging Implementation Plan

## Story Alignment

This plan supports PAY-302 and prepares implementation details needed for PAY-249.

Goals covered by this plan:

- Use Pino as an alternative logging solution to Winston.
- Support environment-based log levels via environment variables.
- Automatically and optionally inject searchable context fields.
- Keep local developer logging useful without flooding output.
- Produce an ADR draft and route it for team review.

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
- If a stage variable exists (`STAGE=dev|stg|prod`), include it in log context, but keep `NODE_ENV` as the primary runtime switch for logger defaults.

## Proposed Pino Design

### 1) Base Logger Module

Create a centralized logger module at `src/utils/logger.ts`.

Responsibilities:

- Build one Pino logger instance.
- Resolve effective log level from environment.
- Use `pino-pretty` transport for local/development human-readable output.
- Write structured JSON directly to stdout for staging/production.
- Export a typed `createRequestLogger(context)` helper using `logger.child()`.

Recommended packages:

- `pino`

Optional package (required for local readability):

- `pino-pretty` — development-only transport for colorized, human-readable output. Not needed in deployed environments.

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

Supported levels (numeric values in parentheses):

- `trace` (10), `debug` (20), `info` (30), `warn` (40), `error` (50), `fatal` (60), `silent` (Infinity)

Note: Pino uses numeric level values in JSON output by default (`"level":30` for `info`). The `formatters.level` option can be used to emit string labels instead if preferred.

### 3) Output Formats by Environment

`local` and `development`:

- Use `pino-pretty` as a transport for human-readable, colorized, single-line output.
- Include timestamp, level label, message, and context fields.

`test`:

- Minimal output. Keep level at `error` by default.
- Skip `pino-pretty` to avoid unnecessary overhead in tests.

`staging` and `production`:

- Write structured JSON directly to stdout (no `pino-pretty`).
- Pino writes JSON natively — no extra format step needed.
- Include stable keys for CloudWatch queryability.

### 4) Context Injection Strategy

Automatic context (added globally via `base` option at logger creation):

- `service`: `ustc-payment-portal`
- `nodeEnv`: from `NODE_ENV`
- `stage`: from `STAGE` when present

Note: Pino automatically includes `pid` and `hostname` in each log line via the `base` option. These can be suppressed by setting `base: undefined` if not desired in production.

Request context (attached per request/handler via `logger.child()`):

- `awsRequestId`
- `path`
- `httpMethod`
- `clientArn` (if available after auth extraction)
- `transactionReferenceId` (when present)

Domain context (optional via nested child logger):

- `feeId`
- `paygovTrackingId`
- `paymentStatus`

Implementation approach:

- Use `logger.child({ ...context })` to inject context once per request/use-case.
- Child loggers in Pino are lightweight and inherit the parent level and transport.
- Avoid manually concatenating IDs into message strings when they can be fields.

### 5) Sensitive Data Rules

Never log:

- Full SOAP payloads with sensitive fields
- Tokens, secrets, passphrases, credentials
- Full PII payloads

Use Pino's built-in `redact` option to censor known sensitive keys at the logger level:

- `"authorization"`
- `"*.token"`
- `"*.password"`
- `"*.secret"`
- `"*.certPassphrase"`

The `redact` option uses fast-redact under the hood and replaces matched values with `[Redacted]` before serialization — more reliable than manual checks.

## Sample Script: Pino Initialization and Environment Usage

Use this as a reference implementation for `src/utils/logger.ts`.

```ts
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
    : { service: "ustc-payment-portal", nodeEnv, stage: process.env.STAGE },
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
```

Usage example in a handler/use-case:

```ts
import { createRequestLogger } from "./utils/logger";

export async function exampleHandler(event: any) {
  const requestLogger = createRequestLogger({
    awsRequestId: event?.requestContext?.requestId,
    path: event?.path,
    httpMethod: event?.httpMethod,
  });

  requestLogger.info("Request started");

  try {
    // Example domain context for searchability.
    requestLogger.info(
      {
        feeId: "FEE-001",
        transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
      },
      "Payment initiated",
    );

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    requestLogger.error({ err }, "Request failed");
    throw err;
  }
}
```

Note on Pino's logging signature: unlike Winston, Pino expects the merging object **first** and the message string **second**: `logger.info({ field: value }, "message")`.

Run examples for different environments:

```bash
# local default: info (pino-pretty output)
NODE_ENV=local npm run start

# test default: error (quiet, no pretty)
NODE_ENV=test npm test

# development default: debug (pino-pretty output)
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
- `local` and `development` route logs through `pino-pretty` for readable console output.
- `staging` and `production` write raw JSON to stdout — no extra formatting overhead.
- `test` remains low-noise unless explicitly overridden.

## Sample Output: How Logs Will Look

### Local/Development (pino-pretty, colorized)

Example `info` log:

```text
[14:38:41.125] INFO (12345): Request started
    awsRequestId: "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad"
    path: "/transactions"
    httpMethod: "POST"
```

Example `error` log:

```text
[14:38:41.499] ERROR (12345): Request failed
    awsRequestId: "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad"
    transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
    err: {
      "type": "InvalidRequestError",
      "message": "missing body",
      "stack": "InvalidRequestError: missing body\n    at ..."
    }
```

### Staging/Production (JSON)

Example `info` log:

```json
{
  "level": "info",
  "time": "2026-04-29T14:40:08.810Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "staging",
  "stage": "stg",
  "msg": "Payment initiated",
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
  "time": "2026-04-29T14:40:09.091Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "production",
  "stage": "prod",
  "msg": "Request failed",
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  "err": {
    "type": "Error",
    "message": "database timeout",
    "stack": "Error: database timeout\n    at ..."
  }
}
```

### Test (minimal by default)

With `NODE_ENV=test` and no override, only `error` logs appear. `info` and `debug` are suppressed. No `pino-pretty` is loaded, so output is raw JSON.

```text
{"level":"error","time":"2026-04-29T14:41:13.002Z","msg":"Request failed","awsRequestId":"test-run-123","err":{"type":"Error","message":"simulated failure","stack":"..."}}
```

### Key Difference from Winston Output

In Pino's JSON output:

- The message key is `"msg"` (not `"message"` as in Winston). This can be changed via the `messageKey` option if needed.
- The timestamp key is `"time"` (not `"timestamp"` as in Winston).
- Level values are numbers by default (`30` for `info`). The `formatters.level` option in the sample above converts these to string labels.

### Field Searchability

In CloudWatch Logs Insights, these fields are directly searchable because they are top-level JSON fields in staging/production logs:

- `level`
- `msg`
- `service`
- `nodeEnv`
- `stage`
- `awsRequestId`
- `transactionReferenceId`
- `feeId`
- `clientArn`

## Implementation Steps

### Phase 1: Foundation

1. Add Pino dependency. Add `pino-pretty` as a dev dependency (local/development use only).
2. Create `src/utils/logger.ts` with:
   - environment-aware level resolution
   - per-environment transport selection (`pino-pretty` vs raw stdout)
   - base metadata
   - `createRequestLogger(context)` helper
3. Add logger unit tests in `src/utils/logger.test.ts` for:
   - level selection precedence
   - invalid `LOG_LEVEL` fallback behavior
   - context merge behavior via child logger

### Phase 2: Runtime Integration

1. Replace direct console usage in core runtime paths first:
   - handlers (`src/lambdaHandler.ts`)
   - error handling (`src/handleError.ts`)
   - app context / outbound calls (`src/appContext.ts`)
   - core use cases (`src/useCases/*` high-traffic paths)
2. Keep migration focused:
   - preserve existing message intent
   - convert string interpolation to structured fields where possible
   - update call signatures to Pino style: `logger.info({ field }, "message")`
3. Keep developer tooling scripts (for now) on console if they are not part of the runtime critical path.

### Phase 3: Request Context Wiring

1. In Lambda request entry points, create child logger with request context.
2. Pass request-scoped logger through app/use-case call chain (or attach to app context).
3. Ensure each error log includes enough fields for search without dumping full objects.

### Phase 4: Configuration and Docs

1. Document new environment variables in README:
   - `LOG_LEVEL`
2. Add `pino-pretty` install note for local setup: `npm install --save-dev pino-pretty`.
3. Add `.env.example` entries for local/test defaults.
4. Update local run docs to show how to tune verbosity.

### Phase 5: Validation

1. Unit tests pass with default test log suppression.
2. Integration test output remains readable (no buffer flooding).
3. Validate logs in deployed non-prod environment are queryable JSON with expected fields.

## Suggested Environment Defaults

| Environment | Default Level | Format        | Notes                                     |
| ----------- | ------------- | ------------- | ----------------------------------------- |
| local       | info          | pino-pretty   | Colorized, readable output locally        |
| test        | error         | raw JSON      | No pino-pretty; reduces test output noise |
| development | debug         | pino-pretty   | Useful during feature work                |
| staging     | info          | JSON (stdout) | Mirrors prod observability                |
| production  | info          | JSON (stdout) | Stable baseline for operations            |

Override in any environment:

- Set `LOG_LEVEL=debug` (or other valid level) when deeper troubleshooting is needed.

## ADR Plan

Draft an ADR under `docs/architecture/decisions/` (next available number) covering:

- Decision: Adopt Pino as standard logging library.
- Why: lowest overhead JSON logging, native structured output, built-in redaction, child logger pattern.
- Alternatives considered: Winston, Bunyan (or equivalent shortlist used in PAY-302 research).
- Consequences: migration effort, `pino-pretty` as dev dependency, `msg` vs `message` key difference from Winston.

Review checklist:

- Team review in architecture sync.
- Confirm default levels by environment.
- Confirm required context keys and redaction policy.
- Confirm `msg` key vs `message` key preference for CloudWatch queries.
- Confirm rollout scope for PAY-249 dependencies.

## Definition of Done for PAY-302 Logging Setup

- Pino logger module is implemented and tested.
- Core runtime paths use Pino instead of direct console logging.
- Environment-based level behavior works and is documented.
- Request/context enrichment works for searchability.
- Local/test output remains manageable.
- ADR is drafted and reviewed.
