# PAY-302: Bunyan Logging Implementation Plan

## Story Alignment

This plan supports PAY-302 and prepares implementation details needed for PAY-249.

Goals covered by this plan:

- Use Bunyan as an alternative logging solution to Winston and Pino.
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

## Proposed Bunyan Design

### 1) Base Logger Module

Create a centralized logger module at `src/utils/logger.ts`.

Responsibilities:

- Build one Bunyan logger instance with a `name` (required by Bunyan).
- Resolve effective log level from environment.
- Configure multiple streams: stdout JSON for staging/production, `bunyan` CLI-compatible stdout for local/development.
- Export a typed `createRequestLogger(context)` helper using `logger.child()`.

Recommended packages:

- `bunyan`

Optional package (required for local readability):

- `bunyan` CLI tool — install globally (`npm install -g bunyan`) to pipe logs through the pretty-printer during local development. No code changes needed; the logger itself always emits JSON.

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

- `trace` (10), `debug` (20), `info` (30), `warn` (40), `error` (50), `fatal` (60)

Note: Bunyan always emits numeric level values in JSON output. The `bunyan` CLI translates these to human-readable labels. There is no built-in option to emit string labels from the library itself.

### 3) Output Formats by Environment

`local` and `development`:

- Pipe output through the `bunyan` CLI for human-readable, colorized output: `node server.js | bunyan`.
- No code change needed — the logger always emits JSON; the developer controls rendering via the CLI tool.

`test`:

- Minimal output. Keep level at `error` by default to suppress noise during test runs.
- Optionally silence output entirely for unit tests by passing `streams: []` to `createLogger`.

`staging` and `production`:

- Write structured JSON directly to stdout (default Bunyan behavior).
- Include stable keys for CloudWatch queryability.

### 4) Context Injection Strategy

Automatic context (added globally via constructor fields at logger creation):

- `name`: `ustc-payment-portal` (required by Bunyan)
- `nodeEnv`: from `NODE_ENV`
- `stage`: from `STAGE` when present

Note: Bunyan automatically includes `hostname`, `pid`, `time`, and `v` (log format version) in every log line. These cannot be suppressed without post-processing.

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

- Use `logger.child({ ...context })` to inject context once per request/use-case. Child loggers in Bunyan are lightweight and carry all parent fields forward.
- Avoid manually concatenating IDs into message strings when they can be fields.
- Bunyan's recommended pattern is `log.info({ widget: mywidget }, "message")` — always give named fields rather than passing a raw object as the first argument.

### 5) Sensitive Data Rules

Never log:

- Full SOAP payloads with sensitive fields
- Tokens, secrets, passphrases, credentials
- Full PII payloads

Use Bunyan serializers to control what fields are emitted for known sensitive objects:

- Define a serializer for sensitive keys (`authorization`, `token`, `password`, `secret`, `certPassphrase`) that returns `"[Redacted]"`.
- Register serializers at logger creation via the `serializers` option.

Note: Unlike Pino's `redact` option, Bunyan does not have a built-in path-based redaction feature. Redaction must be implemented manually through serializers.

## Sample Script: Bunyan Initialization and Environment Usage

Use this as a reference implementation for `src/utils/logger.ts`.

```ts
import bunyan from "bunyan";

type RuntimeEnv = "local" | "test" | "development" | "staging" | "production";

const VALID_LEVELS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
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

// Suppress all output for tests by default (level=error means only errors appear).
// To fully silence logs in unit tests, pass streams: [] instead.
const streams: bunyan.Stream[] =
  nodeEnv === "test"
    ? [{ level: "error", stream: process.stdout }]
    : [{ level: level as bunyan.LogLevel, stream: process.stdout }];

export const logger = bunyan.createLogger({
  name: "ustc-payment-portal",
  level: level as bunyan.LogLevel,
  streams,
  // Add static fields to every log line.
  nodeEnv,
  stage: process.env.STAGE,
  // Redact sensitive fields via serializers.
  serializers: {
    ...bunyan.stdSerializers,
    // Redact any top-level field named "authorization" or "token".
    authorization: () => "[Redacted]",
    token: () => "[Redacted]",
    password: () => "[Redacted]",
    secret: () => "[Redacted]",
    certPassphrase: () => "[Redacted]",
  },
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
    // Bunyan best practice: always name nested objects as a field.
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

Note on Bunyan's logging signature: like Pino, Bunyan expects the fields object **first** and the message string **second**: `log.info({ field: value }, "message")`. Passing a plain object as the only argument will attempt to JSON-ify it rather than use it as the message.

Run examples for different environments:

```bash
# local default: info — pipe through bunyan CLI for pretty output
NODE_ENV=local npm run start | bunyan

# local with specific level filter
NODE_ENV=local npm run start | bunyan -l warn

# test default: error (quiet)
NODE_ENV=test npm test

# development default: debug — pipe through bunyan CLI
NODE_ENV=development npm run dev | bunyan

# staging default: info JSON (raw output to stdout)
NODE_ENV=staging npm run start

# production default: info JSON (raw output to stdout)
NODE_ENV=production npm run start

# override in any environment
NODE_ENV=production LOG_LEVEL=debug npm run start
```

Expected behavior summary:

- `LOG_LEVEL` always wins when valid.
- Invalid `LOG_LEVEL` falls back to environment defaults.
- `local` and `development` emit JSON to stdout; pipe through `bunyan` CLI for colorized output.
- `staging` and `production` write raw JSON to stdout — readable by CloudWatch.
- `test` remains low-noise unless explicitly overridden.

## Sample Output: How Logs Will Look

### Local/Development (piped through bunyan CLI)

Example `info` log:

```text
[2026-04-29T14:38:41.125Z]  INFO: ustc-payment-portal/12345 on host.local: Request started
    awsRequestId: "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad"
    path: "/transactions"
    httpMethod: "POST"
    nodeEnv: "local"
    stage: "dev"
```

Example `error` log:

```text
[2026-04-29T14:38:41.499Z] ERROR: ustc-payment-portal/12345 on host.local: Request failed
    awsRequestId: "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad"
    transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
    err: {
      "message": "missing body",
      "name": "InvalidRequestError",
      "stack": "InvalidRequestError: missing body\n    at ..."
    }
```

### Staging/Production (JSON, raw stdout)

Example `info` log:

```json
{
  "name": "ustc-payment-portal",
  "hostname": "ip-10-0-0-5.ec2.internal",
  "pid": 1,
  "nodeEnv": "staging",
  "stage": "stg",
  "level": 30,
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "path": "/payments/init",
  "httpMethod": "POST",
  "clientArn": "arn:aws:iam::123456789012:role/example-client",
  "feeId": "FEE-001",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  "msg": "Payment initiated",
  "time": "2026-04-29T14:40:08.810Z",
  "v": 0
}
```

Example `error` log with stack:

```json
{
  "name": "ustc-payment-portal",
  "hostname": "ip-10-0-0-5.ec2.internal",
  "pid": 1,
  "nodeEnv": "production",
  "stage": "prod",
  "level": 50,
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  "err": {
    "message": "database timeout",
    "name": "Error",
    "stack": "Error: database timeout\n    at ..."
  },
  "msg": "Request failed",
  "time": "2026-04-29T14:40:09.091Z",
  "v": 0
}
```

### Test (minimal by default)

With `NODE_ENV=test` and no override, only `error` logs appear in raw JSON. `info` and `debug` are suppressed.

```text
{"name":"ustc-payment-portal","hostname":"host.local","pid":12345,"nodeEnv":"test","level":50,"awsRequestId":"test-run-123","err":{"message":"simulated failure","name":"Error","stack":"..."},"msg":"Request failed","time":"2026-04-29T14:41:13.002Z","v":0}
```

### Key Differences from Winston and Pino Output

In Bunyan's JSON output:

- The message key is `"msg"` (same as Pino, different from Winston's `"message"`).
- The timestamp key is `"time"` (same as Pino, different from Winston's `"timestamp"`).
- Level values are always numbers (`30` for `info`). There is no built-in option to emit string labels without a custom stream or post-processing.
- Every log line includes a `"v": 0` field (Bunyan's log format version). This cannot be removed.
- `hostname` and `pid` are always included and cannot be suppressed without custom stream post-processing.

### Field Searchability

In CloudWatch Logs Insights, these fields are directly searchable because they are top-level JSON fields in staging/production logs:

- `name`
- `level` (numeric — filter with `level >= 30` for info and above)
- `msg`
- `nodeEnv`
- `stage`
- `awsRequestId`
- `transactionReferenceId`
- `feeId`
- `clientArn`

## Implementation Steps

### Phase 1: Foundation

1. Add Bunyan dependency. Install `bunyan` CLI globally on developer machines for local pretty-printing.
2. Create `src/utils/logger.ts` with:
   - environment-aware level resolution
   - stream configuration by environment
   - static context fields on the root logger
   - `createRequestLogger(context)` helper using `logger.child()`
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
   - update call signatures to Bunyan style: `log.info({ field }, "message")`
3. Keep developer tooling scripts (for now) on console if they are not part of the runtime critical path.

### Phase 3: Request Context Wiring

1. In Lambda request entry points, create child logger with request context.
2. Pass request-scoped logger through app/use-case call chain (or attach to app context).
3. Ensure each error log includes enough fields for search without dumping full objects.

### Phase 4: Configuration and Docs

1. Document new environment variables in README:
   - `LOG_LEVEL`
2. Add note to local setup docs: install `bunyan` CLI globally with `npm install -g bunyan` for human-readable output.
3. Add `.env.example` entries for local/test defaults.
4. Update local run docs to show how to pipe through the CLI: `npm run start | bunyan`.

### Phase 5: Validation

1. Unit tests pass with default test log suppression.
2. Integration test output remains readable (no buffer flooding).
3. Validate logs in deployed non-prod environment are queryable JSON with expected fields.

## Suggested Environment Defaults

| Environment | Default Level | Format            | Notes                                              |
| ----------- | ------------- | ----------------- | -------------------------------------------------- | ---------------------------- |
| local       | info          | JSON → bunyan CLI | Pipe through `                                     | bunyan` for colorized output |
| test        | error         | raw JSON          | Quiet by default; no CLI dependency in test runner |
| development | debug         | JSON → bunyan CLI | Pipe through `                                     | bunyan` during feature work  |
| staging     | info          | JSON (stdout)     | Mirrors prod observability                         |
| production  | info          | JSON (stdout)     | Stable baseline for operations                     |

Override in any environment:

- Set `LOG_LEVEL=debug` (or other valid level) when deeper troubleshooting is needed.

## ADR Plan

Draft an ADR under `docs/architecture/decisions/` (next available number) covering:

- Decision: Adopt Bunyan as standard logging library.
- Why: structured JSON from day one, child logger pattern, long-established in Node.js services, CLI tool for local filtering.
- Alternatives considered: Winston, Pino (or equivalent shortlist used in PAY-302 research).
- Consequences: migration effort, global `bunyan` CLI install requirement for developers, numeric level values in JSON, `v` and `hostname`/`pid` fields always present.

Review checklist:

- Team review in architecture sync.
- Confirm default levels by environment.
- Confirm required context keys and serializer-based redaction policy.
- Confirm numeric `level` vs string label preference for CloudWatch queries.
- Confirm rollout scope for PAY-249 dependencies.

## Definition of Done for PAY-302 Logging Setup

- Bunyan logger module is implemented and tested.
- Core runtime paths use Bunyan instead of direct console logging.
- Environment-based level behavior works and is documented.
- Request/context enrichment works for searchability.
- Local/test output remains manageable.
- ADR is drafted and reviewed.
