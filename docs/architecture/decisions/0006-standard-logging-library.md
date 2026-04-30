# 6. Standard Logging Library for Node.js Application

Date: 2026-04-30

## Status

Accepted

## Context

The Payment Portal application currently uses scattered `console.log`, `console.warn`, and `console.error` calls throughout the codebase without a standardized logging approach. This presents several challenges:

1. **Inconsistent output formats**: logs are unstructured text, making them difficult to query and analyze in CloudWatch
2. **No log level control**: no mechanism to suppress or filter logs by environment
3. **Missing context**: logs lack structured fields for searchability (request IDs, transaction references, client information)
4. **No sensitive data protection**: no built-in redaction mechanism for tokens, secrets, and PII
5. **Poor local developer experience**: logs are unformatted, making debugging difficult during development

The application runs on AWS Lambda with CloudWatch integration, TypeScript, and Node.js 24.12+. Future deployments will span local development, test, development, staging, and production environments.

## Decision

We will adopt **Pino** as the standard logging library for the Payment Portal.

### Rationale

Pino was selected after evaluating four logging libraries against project requirements:

1. **Structured JSON by default** — no configuration required; all logs are JSON-formatted for CloudWatch queryability
2. **Fastest performance** — Pino offloads JSON serialization and formatting to a worker thread, preventing log I/O from blocking the main thread. This is critical for Lambda cold starts and burst loads
3. **Built-in sensitive data redaction** — `redact` option with path-based field censoring prevents accidental logging of tokens, passwords, and credentials
4. **Excellent local developer experience** — `pino-pretty` transport provides colorized, readable output with zero performance cost in development
5. **First-class TypeScript support** — types ship with the package; excellent IDE support
6. **Active maintenance** — large ecosystem, proven in production Node.js services
7. **Child logger pattern** — clean API for binding request-scoped context that simplifies context propagation through the call stack

### Alternative Evaluation

- **Winston**: More widely adopted but requires explicit JSON configuration and manual redaction. Slower performance due to synchronous formatting on the main thread
- **Bunyan**: Older library with low maintenance activity (no releases since 2021) and 230+ open issues. Numeric-only log levels and non-suppressible extra fields add friction
- **AWS Lambda Power Tools**: Purpose-built for Lambda with automatic context injection, but locks the application to AWS Lambda runtime. Accepted as a viable alternative if portability constraints change

Full comparison: [docs/architecture/proposals/PAY-302-environment-logger/README.md](../proposals/PAY-302-environment-logger/README.md)

## Implementation Details

**Environment-based log levels:**

- `local` → `INFO`
- `test` → `ERROR` (reduce noise during test runs)
- `development` → `DEBUG`
- `staging` → `INFO`
- `production` → `INFO`

**Log level override:** Set `LOG_LEVEL` environment variable in any environment for temporary troubleshooting

**Structured context injection:**

- Automatic: service name, Node.js environment, deployment stage
- Per-request: Lambda request ID, API path, HTTP method, client ARN, transaction reference ID
- Domain-specific: fee ID, payment status, PayGov tracking ID

**Sensitive field redaction:** Configured globally via `redact` option to censor `authorization`, `token`, `password`, `secret`, `certPassphrase`

**Local output:** Pipe through `pino-pretty` for colorized, human-readable formatting: `npm run start | pino-pretty`

**Production output:** Structured JSON to stdout, automatically forwarded by Lambda to CloudWatch Logs

## Consequences

### Positive

- Logs are queryable in CloudWatch Logs Insights using structured fields
- Performance is optimized for Lambda execution model
- Sensitive data is automatically redacted
- Local development becomes more productive with pretty-printed logs
- Log level can be controlled per environment and overridden at runtime
- Codebase adopts a standard approach, reducing cognitive load for new developers

### Negative

- New dependency added to `package.json` (`pino` and `pino-pretty` for dev)
- `pino-pretty` requires separate npm install and configuration
- Message key is `msg` (not `message`), which differs from some team members' expectations
- Requires migration of existing `console.*` calls to `logger.*` calls across the codebase (planned for PAY-249)
- Third-party tools consuming logs must be aware of Pino's field names and JSON structure

## Related Decisions

- PAY-302: Logging strategy research and comparison
- PAY-249: Implementation of logger migration across codebase

## Reference Documentation

- Implementation Plan: [docs/architecture/proposals/PAY-302-environment-logger/pino-implementation-plan.md](../proposals/PAY-302-environment-logger/pino-implementation-plan.md)
- Comparison Document: [docs/architecture/proposals/PAY-302-environment-logger/README.md](../proposals/PAY-302-environment-logger/README.md)
- Pino Official Docs: https://getpino.io
