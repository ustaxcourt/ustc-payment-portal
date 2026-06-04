# USTC Payment Portal

**Instructions here should only be updated through `AGENTS.md`. `copilot-instructions.md` and `CLAUDE.md` are symlinks to `AGENTS.md`**

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
- **Lint**: `npm run lint` (currently TSLint; do not begin the Biome migration unless explicitly instructed).
- **Type-check**: `npm run tsc`
- **Build**: `npm run build`
- **Unit tests** (Jest, Node): `npm test`
  - With coverage: `npm run test:coverage` — coverage target is at or above 90%.
  - Single file: `npx jest --config jest-unit.config.ts path/to/file.test.ts`
  - Unit tests exclude `src/test/integration/` — see [`jest-unit.config.ts`](jest-unit.config.ts).
- **Integration tests**: when running locally, start the local stack in a separate terminal (`npm run start:all`).
  - Local (no SigV4): `npm run test:integration:dev`
  - CI (SigV4-signed, against a deployed API Gateway): `npm run test:integration`
  - SigV4 smoke only: `BASE_URL=$BASE_URL npm run test:integration:sigv4`
- **Smoke-check** the running local stack: `npm run check:local-flow`
- **Database migrations**: `npm run migrate:latest` (Knex). See other `migrate:*` and `seed:*` scripts in `package.json`.

### Project-specific Conventions

- Use `import type` for type-only imports throughout the codebase.
- Use case functions always accept `AppContext` as their first argument.
- All public-facing errors are typed classes under `src/errors/` (e.g., `NotFoundError`, `ServerError`, `ForbiddenError`). Use these rather than raw `Error` throws. Unhandled errors bubble up to `handleError` ([`src/handleError.ts`](src/handleError.ts)), which formats them into an API Gateway response: 4xx typed errors (those with a `statusCode < 500`) and `ServerError` pass their `.message` directly to the client, so be deliberate about message content; raw `Error` throws produce a safe hardcoded "An unexpected error occurred while processing the request" message with a 500 status; `ZodError` returns 400 with the full validation issues array.
- Request/response shapes are validated with Zod schemas in `src/schemas/`. Add a new schema file there for any new API surface.
- Database access always goes through the model layer in `src/db/` (`TransactionModel`, `FeesModel`). Do not query Knex/Objection directly from use cases.
- TypeScript strict mode is enabled (`"strict": true` in [`tsconfig.json`](tsconfig.json)). All code must pass `npm run tsc` without errors.
- `TransactionModel.createReceived` always enforces `paymentStatus='pending'` and `transactionStatus='received'` internally. Do not pass these fields in the call — they will be ignored, and doing so signals a misunderstanding of the model contract.

### Sources of Truth

- **Environment variables**: typed in [`src/types/environment.d.ts`](src/types/environment.d.ts); runtime helpers in [`src/config/appEnv.ts`](src/config/appEnv.ts). `NODE_ENV` is typed as `"development" | "production" | "test"`.
- **Client permissions**: [`src/types/ClientPermission.ts`](src/types/ClientPermission.ts).
- **Database models**: [`src/db/TransactionModel.ts`](src/db/TransactionModel.ts) and [`src/db/FeesModel.ts`](src/db/FeesModel.ts).
- **Database migrations**: [`db/migrations/`](db/migrations/) managed by Knex (`knexfile.ts`).
- **OpenAPI spec**: generated via `npm run generate:openapi` from [`src/openapi/registry.ts`](src/openapi/registry.ts).
- **Logger**: [`src/utils/logger.ts`](src/utils/logger.ts) — prefer `AppContext.logger` over `console` in production code paths (avoid adding new `console.*` calls).

## Security Requirements

- `authorizeClient` MUST be called in every handler/use case that operates on the payment workflow — i.e. anything that reads or mutates fee-scoped data (`initPayment`, `processPayment`, `getDetails`, and any future payment-flow operations). These endpoints are also SigV4-protected at API Gateway as a matter of SOP, so the two signals correlate: if the route is behind SigV4, it needs `authorizeClient`. Read-only dashboard endpoints do not.
- Pino's redaction config is the source of truth for what gets stripped from logs — see `redact.paths` in [`src/utils/logger.ts`](src/utils/logger.ts). Before logging a field that could plausibly carry PII or secrets (emails, names, access codes, payment data, anything signed/authenticated), check that list. If a sensitive field is not covered and you believe it should be, STOP — do not add the log line. Ask the developer whether to add it to `redact.paths` first, using `AskUserQuestion` (or the equivalent prompt mechanism for your agent) before proceeding.

## Testing Conventions

- Unit tests live alongside source files; integration tests go in `src/test/integration/`.
- Test behavior and outcomes, not implementation details.
- Every conditional branch needs a corresponding test case.
- All error paths must be covered — especially the typed errors in `src/errors/`.
- Do NOT write tests for functions that only return hardcoded constants or trivial passthroughs.
- Use specific assertions: prefer `expect(result.status).toBe('pending')` over `expect(result).toBeTruthy()`.
- Do not mock the database layer in integration tests — use the local stack.
- Coverage target is at or above 90% (`npm run test:coverage`).

## Coverage Decisions

Before writing a new test or adding an `// istanbul ignore` comment, use the following to determine the right path. Do not make this decision yourself without checking here first.

### Clear cases — add `// istanbul ignore` without asking:

- Auto-generated or vendored code.
- A function body that is a single hardcoded `return` with no logic whatsoever.

### Ambiguous cases — STOP and ask the developer before proceeding:

- Defensive `catch` blocks around code that is unlikely to throw in practice.
- Trivial passthroughs where it is unclear if the call site already has meaningful test coverage.
- Type guard functions (e.g. `isX(val): val is X`) where a branch may be unreachable given TypeScript's narrowing at the call site — this is common given strict mode and heavy Zod usage in this codebase.
- Any case where you are unsure whether a test would catch a real bug.

When asking, use this format:

> "This code may not warrant a test — should I write one anyway, or add an `// istanbul ignore` comment here? Here's why I'm asking: [reason]"

Do not proceed until the developer responds.

## Git Safety Rules

- Never execute `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git clean`, `git revert`, `git cherry-pick`, `git tag`, or `git stash` commands.
- You may remind the developer of the appropriate git commands, but never run them.
- Only execute read-only git commands like `git status`, `git diff`, `git log`, `git branch`, `git show`.
- The developer is responsible for reviewing and committing all code generated by the agent.

## Terminal Safety Rules

- Never execute destructive file operations like `rm`, `rmdir`, or `del`.
- Never use `sudo`, `chmod`, `chown`, `kill`, or `killall`.
- Never use `curl`, `wget`, or `eval`.
- If a task requires any of these commands, provide the command for the developer to run manually.
