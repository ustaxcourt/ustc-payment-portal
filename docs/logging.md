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
    awsRequestId: context.awsRequestId,
    path: event?.path,
    httpMethod: event?.httpMethod,
  });

  requestLogger.info({}, "Request received");

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

- Lambda request ID
- API path and HTTP method
- Service name and environment
- All fields from the parent logger

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
const credentials = { password: "secret123", apiKey: "xyz789" };
logger.info({ credentials }, "Login attempt"); // password and apiKey will be masked
```

## Log Output

### Local Development

When running `npx ts-node src/devServer.ts | npx pino-pretty`, logs appear as colorized, human-readable text:

```
[14:35:22.125] INFO: Request started
    path: /transactions
    httpMethod: POST
    awsRequestId: 1f9f1b73-4326-48c2-8cfc-c5e39d7f42ad
```

### Staging/Production

Logs are output as JSON, automatically forwarded to CloudWatch Logs by Lambda:

```json
{
  "level": "info",
  "msg": "Payment initiated",
  "time": "2026-04-30T14:35:22.125Z",
  "service": "ustc-payment-portal",
  "nodeEnv": "staging",
  "path": "/payments/init",
  "httpMethod": "POST",
  "feeId": "FEE-001",
  "transactionReferenceId": "8d537be3-80e8-41a3-8acd-8d44cc2a7183"
}
```

## Controlling Log Levels

**Default log levels by environment:**

| Environment | Default Level |
| ----------- | ------------- |
| local       | INFO          |
| test        | ERROR         |
| development | DEBUG         |
| staging     | INFO          |
| production  | INFO          |

**Override at runtime:**

```bash
# See all DEBUG messages
LOG_LEVEL=debug npm run start

# Only show errors and above
LOG_LEVEL=error npm run start
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
