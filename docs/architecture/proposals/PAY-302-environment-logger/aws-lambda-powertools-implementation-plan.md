# PAY-302: AWS Lambda Power Tools Logger Implementation Plan

## Story Alignment

This plan supports PAY-302 and prepares implementation details needed for PAY-249.

Goals covered by this plan:

- Use AWS Lambda Power Tools Logger as an alternative logging solution.
- Support environment-based log levels via environment variables.
- Automatically and optionally inject searchable context fields.
- Keep local developer logging useful without flooding output.
- Produce an ADR draft and route it for team review.

## Current State Snapshot (from this repo)

- The codebase currently uses direct `console.log`, `console.warn`, and `console.error` in many runtime paths.
- `NODE_ENV` values already used in code include: `local`, `test`, `development`, `staging`, `production`.
- CI and deployment workflows also use stage-style naming (`dev`, `stg`, `prod`) and PR ephemeral environments.
- The application runs on AWS Lambda with API Gateway integration.

## Environment Model to Use for Logging

For implementation, treat runtime environments as:

- `local`: local integration and local app execution (Lambda emulator or dev server).
- `test`: unit/integration test runs.
- `development`: default development runtime (Lambda emulator with test events).
- `staging`: pre-production AWS Lambda runtime.
- `production`: production AWS Lambda runtime.

Additional deployment context:

- PR ephemeral environments should behave like non-production by default, unless explicitly overridden with `LOG_LEVEL`.
- AWS Lambda Power Tools automatically detects Lambda runtime context (request ID, function name, version). This is built-in.
- If a stage variable exists (`APP_ENV=dev|stg|prod`), include it in log context, but keep `NODE_ENV` as the primary runtime switch for logger defaults.

## Proposed AWS Lambda Power Tools Design

### 1) Base Logger Module

Create a centralized logger module at `src/utils/logger.ts`.

Responsibilities:

- Build one AWS Lambda Power Tools Logger instance.
- Resolve effective log level from environment.
- Configure structured JSON output for all environments (Power Tools always emits JSON).
- Export typed helpers for request-scoped context via `logger.createChild()` or manual context binding.

Recommended packages:

- `@aws-lambda-powertools/logger` — AWS-maintained logger optimized for Lambda.
- `@aws-lambda-powertools/utilities` — optional utilities for working with Lambda context and middleware.

No additional packages required for pretty-printing — Power Tools emits JSON by default; the `bunyan` CLI or `jq` can be used locally if needed.

### 2) Log Level Resolution

Use this precedence:

1. `LOG_LEVEL` (explicit override in any environment)
2. Environment default by `NODE_ENV`

Recommended defaults:

- `local` -> `INFO`
- `test` -> `ERROR` (reduce noise in test output)
- `development` -> `DEBUG`
- `staging` -> `INFO`
- `production` -> `INFO`

Validation behavior:

- If `LOG_LEVEL` is set to an invalid value, fallback to environment default and emit one startup warning.

Supported levels:

- `DEBUG` (10), `INFO` (20), `WARN` (30), `ERROR` (40), `FATAL` (50), `SILENT` (Infinity)

Note: Power Tools uses uppercase level names and numeric values in JSON output (20 for `INFO`). Levels are case-insensitive when set.

### 3) Output Formats by Environment

All environments:

- Structured JSON to stdout (Power Tools does not offer alternative formats).
- Include Lambda context metadata automatically: request ID, function name, version, memory, etc.
- Include static context fields: service name, node env, stage.

Local development:

- Pipe through `jq` or `bunyan` CLI for readability: `npm run start | jq` or `npm run start | bunyan`.
- Or use Power Tools' logger in the dev server without pretty-printing for integration testing.

Test:

- Minimal output. Keep level at `ERROR` by default.
- Power Tools logs to stdout; test runners can silence output via redirection if needed.

Staging/Production:

- Structured JSON to stdout, which Lambda forwards to CloudWatch Logs.
- Include all Lambda context metadata for traceability.

### 4) Context Injection Strategy

Automatic context (injected by Power Tools automatically):

- `requestId` — Lambda request ID (from `context.awsRequestId`)
- `functionName` — Lambda function name
- `functionVersion` — Lambda function version
- `memorySize` — Lambda memory allocation
- `coldStart` — boolean indicating if this is a cold start

Static context (configured at logger creation):

- `service` — `ustc-payment-portal`
- `nodeEnv` — from `NODE_ENV`
- `stage` — from `APP_ENV` when present

Request context (attached per request/handler):

- `awsRequestId` — Lambda request ID (redundant with Power Tools' automatic field, but useful for explicit clarity)
- `path` — API Gateway path
- `httpMethod` — HTTP method
- `clientArn` — if available after auth extraction
- `transactionReferenceId` — when present

Domain context (optional via additional context binding):

- `feeId`
- `paygovTrackingId`
- `paymentStatus`

Implementation approach:

- Use `logger.createChild()` to bind request-scoped context once per Lambda invocation.
- Alternatively, use `logger.appendKeys()` to add context inline without creating a child logger.
- Power Tools provides a middleware decorator for Express, but for Lambda handlers, explicit context binding is preferred.

### 5) Sensitive Data Rules

Never log:

- Full SOAP payloads with sensitive fields
- Tokens, secrets, passphrases, credentials
- Full PII payloads

Use Power Tools' `logger.maskJsonValues()` method to redact sensitive fields before logging:

```ts
logger.maskJsonValues({ authorization: "Bearer token", password: "secret123" });
```

Or define a custom serializer for known sensitive objects.

## Sample Script: AWS Lambda Power Tools Logger Initialization and Environment Usage

Use this as a reference implementation for `src/utils/logger.ts`.

```ts
import { Logger } from "@aws-lambda-powertools/logger";

type RuntimeEnv = "local" | "test" | "development" | "staging" | "production";

const VALID_LEVELS = new Set([
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
  "SILENT",
]);

const DEFAULT_LEVEL_BY_ENV: Record<RuntimeEnv, string> = {
  local: "INFO",
  test: "ERROR",
  development: "DEBUG",
  staging: "INFO",
  production: "INFO",
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
  const uppercaseLevel = configuredLevel?.toUpperCase();

  if (uppercaseLevel && VALID_LEVELS.has(uppercaseLevel)) {
    return uppercaseLevel;
  }

  if (
    configuredLevel &&
    (!uppercaseLevel || !VALID_LEVELS.has(uppercaseLevel))
  ) {
    // One startup warning if LOG_LEVEL is invalid.
    process.stderr.write(
      `[logger] Invalid LOG_LEVEL="${configuredLevel}"; falling back to ${DEFAULT_LEVEL_BY_ENV[nodeEnv]}\n`,
    );
  }

  return DEFAULT_LEVEL_BY_ENV[nodeEnv];
}

const nodeEnv = resolveNodeEnv(process.env.NODE_ENV);
const level = resolveLogLevel(nodeEnv, process.env.LOG_LEVEL);

export const logger = new Logger({
  logLevel: level as any,
  serviceName: "ustc-payment-portal",
  // Power Tools adds Lambda context automatically; these are static fields.
  persistentLogAttributes: {
    nodeEnv,
    stage: process.env.APP_ENV,
  },
});

// Redact sensitive fields globally.
logger.maskJsonValues([
  "authorization",
  "token",
  "password",
  "secret",
  "certPassphrase",
]);

export function createRequestLogger(context: {
  awsRequestId?: string;
  path?: string;
  httpMethod?: string;
  clientArn?: string;
  transactionReferenceId?: string;
}) {
  // Power Tools provides createChild() for request-scoped context.
  // Alternatively, use appendKeys() to add context to the current logger.
  return logger.createChild({
    awsRequestId: context.awsRequestId,
    path: context.path,
    httpMethod: context.httpMethod,
    clientArn: context.clientArn,
    transactionReferenceId: context.transactionReferenceId,
  });
}
```

Usage example in a Lambda handler:

```ts
import { Logger } from "@aws-lambda-powertools/logger";
import { createRequestLogger } from "./utils/logger";

export async function exampleHandler(event: any, context: any) {
  const requestLogger = createRequestLogger({
    awsRequestId: context.awsRequestId,
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

Note on Power Tools: the logger is context-aware by default in Lambda. Context is automatically injected from the Lambda runtime; you do not need to manually pass it.

Run examples for different environments:

```bash
# local default: INFO — pipe through jq for readability
NODE_ENV=local npm run start | jq

# test default: ERROR (quiet)
NODE_ENV=test npm test

# development default: DEBUG
NODE_ENV=development npm run dev | jq

# staging default: INFO JSON (raw to CloudWatch)
NODE_ENV=staging npm run start

# production default: INFO JSON (raw to CloudWatch)
NODE_ENV=production npm run start

# override in any environment
NODE_ENV=production LOG_LEVEL=debug npm run start
```

Expected behavior summary:

- `LOG_LEVEL` always wins when valid.
- Invalid `LOG_LEVEL` falls back to environment defaults.
- All environments emit structured JSON.
- Lambda context is automatically injected (request ID, function name, cold start, etc.).
- Local output is piped through `jq` or `bunyan` CLI for readability.
- `staging` and `production` logs integrate seamlessly with CloudWatch.

## Sample Output: How Logs Will Look

### Local/Development (JSON piped through jq)

Example `info` log:

```json
{
  "level": 20,
  "message": "Request started",
  "timestamp": "2026-04-29T14:38:41.125Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "local",
  "stage": "dev",
  "cold_start": false,
  "function_name": "payment-portal-dev",
  "function_version": "1",
  "request_id": "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad",
  "awsRequestId": "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad",
  "path": "/transactions",
  "httpMethod": "POST"
}
```

Example `error` log:

```json
{
  "level": 40,
  "message": "Request failed",
  "timestamp": "2026-04-29T14:38:41.499Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "development",
  "stage": "dev",
  "request_id": "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad",
  "awsRequestId": "1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  "err": {
    "name": "InvalidRequestError",
    "message": "missing body",
    "stack": "InvalidRequestError: missing body\n    at ..."
  },
  "cold_start": false,
  "function_name": "payment-portal-dev"
}
```

### Staging/Production (JSON to CloudWatch)

Example `info` log:

```json
{
  "level": 20,
  "message": "Payment initiated",
  "timestamp": "2026-04-29T14:40:08.810Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "staging",
  "stage": "stg",
  "cold_start": false,
  "function_name": "payment-portal-stg",
  "function_version": "2",
  "request_id": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "awsRequestId": "b39c602f-5848-4da7-b8e6-2d4bb2f9f7b6",
  "path": "/payments/init",
  "httpMethod": "POST",
  "clientArn": "arn:aws:iam::123456789012:role/example-client",
  "feeId": "FEE-001",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
}
```

### Key Differences from Winston, Pino, and Bunyan

In Power Tools' JSON output:

- Automatic Lambda context fields: `request_id`, `function_name`, `function_version`, `cold_start`, `memory_allocated` (with underscores, not camelCase).
- `timestamp` key (not `time` or `msg`).
- Level is numeric only (`20` for `INFO`).
- Message is always in the `message` key (not `msg`).
- No extra fields like `hostname`, `pid`, or `v` — it's designed for Lambda where these are less relevant.

### Field Searchability

In CloudWatch Logs Insights, these fields are directly searchable:

- `level` (numeric — filter with `level >= 20` for INFO and above)
- `message`
- `service`
- `nodeEnv`
- `stage`
- `request_id` (or `awsRequestId` if you add it explicitly)
- `transactionReferenceId`
- `feeId`
- `clientArn`
- `cold_start`

## Implementation Steps

### Phase 1: Foundation

1. Add `@aws-lambda-powertools/logger` dependency.
2. Create `src/utils/logger.ts` with:
   - environment-aware level resolution
   - static metadata on the root logger
   - `createRequestLogger(context)` helper using `logger.createChild()`
3. Add logger unit tests in `src/utils/logger.test.ts` for:
   - level selection precedence
   - invalid `LOG_LEVEL` fallback behavior
   - context binding behavior

### Phase 2: Runtime Integration

1. Replace direct console usage in core runtime paths first:
   - handlers (`src/lambdaHandler.ts`)
   - error handling (`src/handleError.ts`)
   - app context / outbound calls (`src/appContext.ts`)
   - core use cases (`src/useCases/*` high-traffic paths)
2. Keep migration focused:
   - preserve existing message intent
   - convert string interpolation to structured fields where possible
   - use `logger.info("message", { field })` signature
3. Keep developer tooling scripts (for now) on console if they are not part of the runtime critical path.

### Phase 3: Request Context Wiring

1. In Lambda request entry points, create request-scoped logger with context.
2. Pass request-scoped logger through app/use-case call chain (or attach to app context).
3. Ensure each error log includes enough fields for search without dumping full objects.

### Phase 4: Configuration and Docs

1. Document new environment variables in README:
   - `LOG_LEVEL`
2. Add note to local setup: use `jq` or `bunyan` CLI to pretty-print logs: `npm run start | jq`.
3. Add `.env.example` entries for local/test defaults.
4. Document that Lambda context (request ID, cold start, etc.) is automatically included.

### Phase 5: Validation

1. Unit tests pass with default test log suppression.
2. Integration test output remains readable (no buffer flooding).
3. Validate logs in deployed non-prod Lambda environment are queryable JSON with expected fields.

## Suggested Environment Defaults

| Environment | Default Level | Format            | Notes                                         |
| ----------- | ------------- | ----------------- | --------------------------------------------- |
| local       | INFO          | JSON → jq/bunyan  | Pipe through `\| jq` for colorized output     |
| test        | ERROR         | raw JSON          | No extra tools; test runner controls output   |
| development | DEBUG         | JSON → jq/bunyan  | Pipe through `\| jq` during feature work      |
| staging     | INFO          | JSON (CloudWatch) | Integrated with CloudWatch Logs automatically |
| production  | INFO          | JSON (CloudWatch) | Integrated with CloudWatch Logs automatically |

Override in any environment:

- Set `LOG_LEVEL=debug` (or other valid level) when deeper troubleshooting is needed.

## ADR Plan

Draft an ADR under `docs/architecture/decisions/` (next available number) covering:

- Decision: Adopt AWS Lambda Power Tools Logger as standard logging library.
- Why: purpose-built for Lambda, automatic context injection, AWS-maintained, zero extra configuration for CloudWatch integration.
- Alternatives considered: Pino, Winston, Bunyan.
- Consequences: lock-in to Lambda runtime (less portable to other environments), AWS dependency, numeric-only log levels.

Review checklist:

- Team review in architecture sync.
- Confirm default levels by environment.
- Confirm required context keys.
- Confirm redaction strategy via `maskJsonValues()`.
- Confirm rollout scope for PAY-249 dependencies.

## Definition of Done for PAY-302 Logging Setup

- AWS Lambda Power Tools Logger is initialized and tested.
- Core runtime paths use Power Tools instead of direct console logging.
- Environment-based level behavior works and is documented.
- Lambda context and request-scoped enrichment work for searchability.
- Local/test output remains manageable.
- ADR is drafted and reviewed.
