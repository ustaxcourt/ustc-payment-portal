# Logging Guide

The Payment Portal uses [Pino](https://getpino.io) for structured JSON logging. This guide explains how to use the logger in your code.

## Quick Start

### Importing the logger

```typescript
import { logger } from "./utils/logger";

// Log at different levels
logger.debug({}, "This is a debug message");
logger.info({}, "This is an info message");
logger.warn({}, "This is a warning");
logger.error({}, "This is an error");
```

### Logging with structured fields

Always include relevant context as structured fields rather than string interpolation:

```typescript
// Good ✓
logger.info(
  {
    feeId: "FEE-001",
    transactionReferenceId: "8d537be3-80e8-41a3-8acd-8d44cc2a7183",
    amount: 150.0,
  },
  "Payment initiated",
);

// Avoid ✗
logger.info({}, `Payment initiated for fee ${feeId} with amount ${amount}`);
```

Structured fields make logs queryable in CloudWatch Logs Insights.

## Request-Scoped Logging

For Lambda handlers and request-level processing, create a child logger with request context:

```typescript
import { createRequestLogger } from "./utils/logger";

export async function lambdaHandler(event: any, context: any) {
  const requestLogger = createRequestLogger({
    requestId: event?.requestContext?.requestId,
    path: event?.path,
    httpMethod: event?.httpMethod,
  });

  requestLogger.debug({}, "Request received");

  try {
    // Your handler logic here
    requestLogger.info({ feeId: "FEE-001" }, "Processing payment");
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    requestLogger.error({ err }, "Request failed");
    throw err;
  }
}
```

The request logger automatically includes:

- API request ID (`requestId` from API Gateway)
- API path and HTTP method
- Any endpoint-specific request fields you bind, such as `clientName`, `feeId`, `transactionReferenceId`, `agencyTrackingId`, and `metadata`
- Any fields configured on the parent logger, such as service and environment metadata when present

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
- `email`
- `fullName`
- `accessCode`

If you need to log an object containing sensitive fields, they will be masked automatically:

```typescript
// Sensitive fields are redacted automatically
const credentials = { password: "secret123", token: "xyz789" };
logger.info({ credentials }, "Login attempt"); // password and token will be masked
```

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
