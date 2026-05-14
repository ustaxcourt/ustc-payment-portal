# Logging Guide

The Payment Portal uses [Pino](https://getpino.io) for structured JSON logging. This guide explains how to use the logger in your code.

## Quick Start

### Choosing the right logger API

Use one of these patterns based on where the code runs.

### Logger Signature Matrix

Use message-first call order for both logger APIs:

| Logger API | Use in | Signature |
| --- | --- | --- |
| `appContext.logger` / `getPortalLogger` | Lambda handlers, use cases, request-scoped app code | `logger.info("message", { context })` |
| `createLogger()` (raw Pino) | standalone scripts and low-level modules | `logger.info("message", { context })` |

If you are writing endpoint business logic, use message-first via `appContext.logger`.

#### Pattern A: request and use-case code (preferred)

In handlers and use cases, use `appContext.logger` (or `logger` from `getPortalLogger`) so request context can be added and reused.

```typescript
import { createAppContext } from "./appContext";

const appContext = createAppContext();

appContext.logger.clearContext();
appContext.logger.addContext({
  path: "/init",
  requestId: "abc-123",
});

// Message-first API for appContext.logger
appContext.logger.debug("Received request");
appContext.logger.info("Payment initiated", { feeId: "FEE-001" });
appContext.logger.error("Failed to persist transaction", { err });
```

#### Pattern B: standalone scripts and isolated modules

For scripts (for example OpenAPI generation or migration tasks), create a raw Pino logger directly.

```typescript
import { createLogger } from "./utils/logger";

const logger = createLogger();

// Message-first API for createLogger()
logger.debug("Starting generation", { operation: "openapi:generate" });
logger.info("OpenAPI JSON generated", { outputPath: "docs/openapi.json" });
logger.warn("Retrying operation", { retries: 1 });
logger.error("Script failed", { err });
```

### Logging with structured fields

Always include relevant context as structured fields rather than string interpolation:

```typescript
// Good with appContext.logger ✓
appContext.logger.info("Payment initiated", {
  feeId: "FEE-001",
  transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  amount: 150.0,
});

// Good with createLogger() / raw Pino ✓
logger.info("Payment initiated", {
  feeId: "FEE-001",
  transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
  amount: 150.0,
});

// Avoid ✗ string interpolation
appContext.logger.info(
  `Payment initiated for fee ${feeId} with amount ${amount}`,
);
```

Structured fields make logs queryable in CloudWatch Logs Insights.

## Request-Scoped Logging

For Lambda handlers and request-level processing, attach context on `appContext.logger` and clear it at the start of each request:

```typescript
import { createAppContext } from "./appContext";

export async function lambdaHandler(event: any, context: any) {
  const appContext = createAppContext();

  appContext.logger.clearContext();
  appContext.logger.addContext({
    apiGatewayRequestId: event?.requestContext?.requestId,
    lambdaRequestId: context?.awsRequestId,
    path: event?.path,
    httpMethod: event?.httpMethod,
  });

  appContext.logger.debug("Request received");

  try {
    appContext.logger.addContext({ feeId: "FEE-001" });
    appContext.logger.info("Processing payment");
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    appContext.logger.error("Request failed", { err });
    throw err;
  }
}
```

Note: `createRequestLogger` is not part of the current implementation in this repo.

## Error Handling Logger

`handleError` uses the shared logger from `src/utils/getPortalLogger.ts` and does not support logger dependency injection.

- Runtime code should call `handleError(err)`.
- Tests should mock `src/utils/getPortalLogger.ts` when asserting error logging behavior.

The request logger automatically includes:

- API request ID (`apiGatewayRequestId` from API Gateway `event.requestContext.requestId`)
- Lambda invocation ID when needed (`lambdaRequestId` from `context.awsRequestId`)
- API path and HTTP method
- Any endpoint-specific request fields you bind, such as `clientName`, `feeId`, `transactionReferenceId`, `agencyTrackingId`, and `metadataKeys`
- Any fields configured on the parent logger, such as service and environment metadata when present

We intentionally keep these as separate fields because the API Gateway request ID and the Lambda invocation ID are different correlation identifiers.

## Current `/init` Flow

The `/init` path currently uses request-scoped logging in both the Express development server and the Lambda handler.

- Receipt of the request is logged at `debug`
- Request parameters are logged at `info` using safe summaries (for example URL origins and metadata keys, not full metadata values)
- The generated `agencyTrackingId` is added to a child logger after the received transaction is written to the database
- Pay.gov initialization completion is logged at `info`
- Database, Pay.gov, and processing failures are logged at `error`

This makes `/init` logs searchable in CloudWatch Logs Insights by request-level fields such as request ID, client name, fee ID, transaction reference ID, agency tracking ID, metadata keys, and log level.

## Sensitive Data

**Never log sensitive information directly.** Sensitive fields are automatically redacted:

- `authorization`
- `token`
- `password`
- `secret`
- `certPassphrase`

If you need to log an object containing sensitive fields, they will be masked automatically:

```typescript
// Sensitive fields are redacted automatically
const credentials = { password: "secret123", token: "xyz789" };
logger.info("Login attempt", { credentials }); // password and token will be masked
```

Avoid logging full runtime objects (for example raw `fetch` response objects) because they can include complex internal structures. Prefer a safe summary such as `status`, `ok`, IDs, or key names.

## Log Output

### Local Development

When running `npm run start:server`, logs appear as colorized, human-readable text:

```
[14:35:22.125] INFO: Request started
    path: /transactions
    httpMethod: POST
    requestId: 1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad
```

### Staging/Production

Logs are output as JSON, automatically forwarded to CloudWatch Logs by Lambda:

```json
{
  "level": "info",
  "msg": "Payment initiated",
  "time": "2026-04-30T14:35:22.125Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "production",
  "appEnv": "stg",
  "path": "/payments/init",
  "httpMethod": "POST",
  "feeId": "FEE-001",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
}
```

In this repo, deployment topology comes from `APP_ENV` (`local|dev|stg|prod|test`) while Node runtime mode uses `NODE_ENV` (`development|production|test`).

## Controlling Log Levels

**Default log levels by NODE_ENV:**

| NODE_ENV    | Default Level |
| ----------- | ------------- |
| test        | ERROR         |
| development | DEBUG         |
| production  | INFO          |

**Override at runtime:**

```bash
# See all DEBUG messages
LOG_LEVEL=debug npm run start:server

# Only show errors and above
LOG_LEVEL=error npm run start:server
```

## CloudWatch Log Queries

In CloudWatch Logs Insights, use these fields to query logs:

```sql
# Find all errors
fields @timestamp, msg, err
| filter level in ["error", "fatal"]

# Find logs for a specific transaction
fields @timestamp, msg
| filter transactionReferenceId = "8d537be3-80e8-41a3-8acd-8d44cc2a7183"

# Find slow operations (errors and warnings)
fields @timestamp, msg, duration
| filter level in ["warn", "error", "fatal"]

# Search by client
fields @timestamp, msg, clientArn
| filter clientArn like /DAWSON/
```

## Reference

- [Architecture Decision: Standard Logging Library](./architecture/decisions/0006-standard-logging-library.md)
- [Implementation Plan](./architecture/proposals/PAY-302-environment-logger/pino-implementation-plan.md)
- [Pino Documentation](https://getpino.io)
