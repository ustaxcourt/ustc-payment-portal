# USTC Payment Portal

This is the United States Tax Court's payment portal — a TypeScript Node.js package and AWS Lambda-based service for integrating with Pay.gov for electronic payment processing.

## Project Assumptions

- Assume that this project hasn't been released yet, and doesn't have any users.

## Project Information

The portal is published as `@ustaxcourt/payment-portal` and serves two purposes:

1. **Internal domain objects** — exports SOAP request entity classes and Lambda handler functions used internally. Request/response types are defined as Zod-inferred TypeScript types in `src/schemas/` but are not yet exported for external consumers. Zod Schemas are also used to define API Contracts inside of our OpenAPI docs.
2. **Lambda handlers** — AWS Lambda entrypoints that receive API Gateway requests, validate them, call Pay.gov's SOAP API, and persist results to PostgreSQL via Knex/Objection.

Data flow: Client → API Gateway (AWS SigV4) → Lambda handler (`src/handlers/`) → use case (`src/useCases/`) → Pay.gov SOAP API + PostgreSQL database.

### Running, Linting, and Testing the Application

- **Local stack** (recommended one-command start): `npm run start:all`. This starts Docker/Postgres, the mock Pay.gov test server, and the Express dev server. See [running-locally.md](running-locally.md) for full details, port configuration, and advanced options.
- **Lint**: `npm run lint` (currently TSLint; a migration to Biome is planned).
- **Type-check**: `npm run tsc`
- **Build**: `npm run build`
- **Unit tests** (Jest, Node): `npm test`
  - With coverage: `npm run test:coverage` — coverage must remain at or above 90%.
  - Single file: `npx jest --config jest-unit.config.ts path/to/file.test.ts`
  - Unit tests exclude `src/test/integration/` — see [`jest-unit.config.ts`](jest-unit.config.ts).
- **Integration tests**: requires the local stack running in a separate terminal (`npm run start:all`).
  - Local (no SigV4): `npm run test:integration:dev`
  - CI (SigV4-signed, against a deployed API Gateway): `npm run test:integration`
  - SigV4 smoke only: `BASE_URL=$BASE_URL npm run test:integration:sigv4`
- **Smoke-check** the running local stack: `npm run check:local-flow`
- **Database migrations**: `npm run migrate:latest` (Knex). See other `migrate:*` and `seed:*` scripts in `package.json`.

### Project-specific Conventions

- Use `import type` for type-only imports throughout the codebase.
- Use case functions always accept `AppContext` as their first argument.
- All public-facing errors are typed classes under `src/errors/` (e.g., `NotFoundError`, `ServerError`, `ForbiddenError`). Use these rather than raw `Error` throws. Unhandled errors bubble up to `handleError` ([`src/handleError.ts`](src/handleError.ts)), which formats them into an API Gateway response: 4xx typed errors (those with a `statusCode < 500`) and `ServerError` pass their `.message` directly to the client, so be deliberate about message content; raw `Error` throws produce a safe hardcoded `"An unexpected error occurred"` message with a 500 status; `ZodError` returns 400 with the full validation issues array.
- Request/response shapes are validated with Zod schemas in `src/schemas/`. Add a new schema file there for any new API surface.
- Database access always goes through the model layer in `src/db/` (`TransactionModel`, `FeesModel`). Do not query Knex/Objection directly from use cases.
- TypeScript strict mode is enabled (`"strict": true` in [`tsconfig.json`](tsconfig.json)). All code must pass `npm run tsc` without errors.
- Client authorization (`authorizeClient`) must be called in every handler/use case before accessing fee-specific data. `ClientPermission.allowedFeeIds` supports the wildcard `"*"` to authorize access to all fee IDs.
- `TransactionModel.createReceived` always sets `paymentStatus='pending'` and `transactionStatus='received'` regardless of input — do not pass those fields explicitly.
- Logger redaction covers `authorization`, `token`, `password`, `secret`, and `certPassphrase`. Do not rely on it to redact `email`, `fullName`, or `accessCode`.

### Sources of Truth

- **Environment variables**: typed in [`src/types/environment.d.ts`](src/types/environment.d.ts); runtime helpers in [`src/config/appEnv.ts`](src/config/appEnv.ts). `NODE_ENV` is typed as `"development" | "production" | "test"`.
- **Client permissions**: [`src/types/ClientPermission.ts`](src/types/ClientPermission.ts).
- **Database models**: [`src/db/TransactionModel.ts`](src/db/TransactionModel.ts) and [`src/db/FeesModel.ts`](src/db/FeesModel.ts).
- **Database migrations**: [`db/migrations/`](db/migrations/) managed by Knex (`knexfile.ts`).
- **OpenAPI spec**: generated via `npm run generate:openapi` from [`src/openapi/registry.ts`](src/openapi/registry.ts).
- **Logger**: [`src/utils/logger.ts`](src/utils/logger.ts) — use `AppContext.logger` rather than `console` in production code paths.

## Testing Conventions

- Unit tests live alongside source files; integration tests go in `src/test/integration/`
- Test behavior and outcomes, not implementation details
- Every conditional branch needs a corresponding test case
- All error paths must be covered -- especially the typed errors in `src/errors/`
- Do NOT write tests for functions that only return hardcoded constants or trivial passthroughs
- Use specific assertions: prefer `expect(result.status).toBe('pending')` over `expect(result).toBeTruthy()`
- Do not mock the database layer in integration tests -- use the local stack
- Coverage must stay at or above 90% (`npm run test:coverage`)

## Coverage Decisions

Before writing a new test or adding an `// istanbul ignore` comment, you MUST
stop and ask the developer which is preferred. Do not make this decision yourself.

Use this checklist to determine if a coverage decision is needed:

- The function only returns a hardcoded value
- The function is a trivial passthrough with no branching logic
- The only uncovered lines are defensive error handlers that cannot
  realistically be triggered (e.g. a catch block around infallible code)
- The code is auto-generated or vendored

If any of the above apply, ask:
"This code may not warrant a test -- should I write one anyway, or add an
`// istanbul ignore` comment here? Here's why I'm asking: [reason]"

Do not proceed until the developer responds.

### Outdated Files

- **`COVERAGE.md`**: This file is outdated and should not be relied upon for current coverage guidance.

## Git Safety Rules

- Never execute `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git clean`, `git revert`, `git cherry-pick`, `git tag`, or `git stash` commands
- You may remind the developer of the appropriate git commands, but never run them
- Only execute read-only git commands like `git status`, `git diff`, `git log`, `git branch`, `git show`
- The developer is responsible for reviewing and committing all code generated by Copilot

## Terminal Safety Rules

- Never execute destructive file operations like `rm`, `rmdir`, or `del`
- Never use `sudo`, `chmod`, `chown`, `kill`, or `killall`
- Never use `curl`, `wget`, or `eval`
- If a task requires any of these commands, provide the command for the developer to run manually
