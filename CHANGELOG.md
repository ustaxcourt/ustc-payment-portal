# @ustaxcourt/payment-portal

## 0.1.4

### Patch Changes

- 9b0916e: PAY-257: Separate `NODE_ENV` (Node runtime) from `APP_ENV` (deployment topology).

  `NODE_ENV` is restricted to `development | production | test`. A new `APP_ENV` variable (`local | dev | stg | prod | test`) drives all deployment-topology branching in our code, read via the typed accessor in `src/config/appEnv.ts` (`getAppEnv()`, `isLocal()`, `isDeployed()`). TypeScript now rejects any string equality between `NODE_ENV` and disallowed values like `"local"` or `"staging"`.

  Notable behavior change: stg Lambdas now run with `NODE_ENV=production` (previously `staging`) so they behave like prod at the Node-runtime layer (no verbose Express errors, no dev-only middleware). The deployment-topology distinction is carried by `APP_ENV=stg`.

  Deployment: all deployed Lambdas now require `APP_ENV` in their environment block — Terraform updates in this PR provide it for dev/stg/prod. Local developers must update their `.env` files: `NODE_ENV="local"` is no longer valid; use `NODE_ENV="development"` + `APP_ENV="local"`.

  See [ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md) for full rationale.

- d6d8af6: Updates transaction integration test to cover success/fail/pending outcomes across plastic_card, ach, and paypal.
- 261294f: ## What Changed?

  ### `processPayment` Error Handling

  Refactored `processPayment.ts` to split the original single `try/catch` into two sequential blocks, making the failure mode unambiguous:

  - **First `try`** wraps `req.makeSoapRequest`. On failure:
    - `FailedTransactionError` — existing path preserved: `updateToFailed` with Pay.gov's code/detail, return `paymentStatus: "failed"`.
    - `ZodError` — Pay.gov returned a body that failed schema validation: `safeUpdateToFailed` + throw `PayGovError` (504). Previously this reached `handleError`'s `ZodError → 400` branch, incorrectly blaming the client.
    - Anything else (network, parse, etc.) — `safeUpdateToFailed` + throw `PayGovError` (504) with a retry-encouraging message.
  - **Second `try`** wraps `TransactionModel.updateAfterPayGovResponse`. On failure: `safeUpdateToFailed` + throw `ServerError` (500), since the DB is our infrastructure, not Pay.gov's.

  Also reordered `ZodError` and `PayGovError` branches in `handleError.ts` so that Pay.gov-originated `PayGovError`s are matched before the generic `ZodError → 400` branch, preserving correct 400 behavior for request-body validation while ensuring Pay.gov faults yield 504.

  ### `safeUpdateToFailed` Utility (`src/utils/safeUpdateToFailed.ts`)

  **instead of writing a identical try-catch calling `updateToFailed`, anywhere we need to mark the row as failed just use `safeUpdateToFailed`.**
  Extracted a new shared helper that wraps `TransactionModel.updateToFailed`, logs any DB error from the recovery attempt, and returns `void`. This prevents a failure-in-recovery from masking the primary error thrown to the caller. The helper is now used in both `processPayment` and `initPayment`.

  ### `initPayment` Refactor

  Replaced two inline `.catch((dbErr) => console.error(...))` patterns (after `makeSoapRequest` failure and after `updateToInitiated` failure) with `await safeUpdateToFailed(...)`. Behavior is identical; the refactor ensures the recovery pattern is shared and consistent across use cases.

  ***

  ## Testing

  - **`src/utils/safeUpdateToFailed.test.ts`** (new): covers the happy path, swallowing of rejections without throwing, and logging of the `agencyTrackingId` + error on failure.
  - **`src/useCases/processPayment.test.ts`** (updated): added unit tests for ZodError from Pay.gov response validation, network failure from `makeSoapRequest`, and DB write failure in `updateAfterPayGovResponse`. Tests assert both the error type/code returned to the caller and that `updateToFailed` is called (or not called) as expected.

- 014abbd: PAY-271: PR environment RDS isolation — each PR gets its own database for integration testing
- e54887e: - Updated FK constraint for `fee_id` as NOT VALID so Postgres skips the historical row check (fees table is empty at migration time; 01_reference_data seeds it after);

  - inlined known fee amounts in the transaction_amount backfill for the same reason.

  - Validate **POST** `/process` requests — tighten ProcessPaymentRequestSchema with `.strict()` (reject unknown fields) and `.min(1)` (reject empty token strings), matching the pattern already established for /init.
  - Standardize error responses — handleError now returns a consistent { message, errors } JSON envelope for all error types (Zod validation, InvalidRequestError, PayGovError, and generic 500s), replacing the previous mix of plain text and JSON
  - Extract shared parseAndValidate helper in `lambdaHandler.ts` — both initPaymentHandler and processPaymentHandler now use the same JSON-parse + Zod-validation pipeline with a discriminated union return type (ParseResult<T>) for proper type narrowing (eliminates non-null assertions)

  - Align OpenAPI docs — added `ValidationErrorResponseSchema` and `GatewayErrorSchema`; updated `/process` 400 response from text/plain to application/json and added 504 response using `GatewayErrorSchema` to match what the API actually returns; regenerated openapi.json and openapi.yaml

  - Comprehensive test coverage — unit tests cover missing body, empty body, malformed JSON, missing token, wrong type, empty token, too-short token, unknown fields (with unrecognized_keys assertion), PayGovError propagation, and generic 500; integration tests cover malformed JSON, missing token, and unknown fields against the deployed endpoint

- 39c35ba: PAY-219: initPayment returns Pay.gov token and computed redirect URL with 504/500 error handling
- da3f1aa: #### `initPayment` Use Case

  - Replaced the blanket `ConflictError` throw for duplicate `transactionReferenceId` with a two-path check keyed on `lastUpdatedAt`:
    - **Token < 3 hours old** (`MAX_TOKEN_AGE_MS = 10_800_000`): returns the existing `paygovToken` and reconstructed `paymentRedirect` URL without touching Pay.gov.
    - **Token ≥ 3 hours old**: calls `TransactionModel.updateToFailed(agencyTrackingId, 5009, "Existing token expired")` on the stale record, then falls through to the normal Pay.gov token-request path.

  ### `TransactionModel.findInFlightByReferenceId`

  - Narrowed the status filter from `['received', 'initiated', 'pending']` to `['initiated']` — only `initiated` records have a Pay.gov token worth reusing.
  - Fixed a Knex bug introduced in that same commit: the value passed to `.whereIn` was the bare string `'initiated'` (which Knex iterates as individual characters), not the array `['initiated']`.

  ### Tests

  - **Unit** (`src/useCases/initPayment.test.ts`): replaced the old `it.each` ConflictError assertion with two focused cases — fresh-token reuse (asserts `createReceived` and `updateToFailed` are not called) and expired-token eviction (asserts `updateToFailed` fires with code 5009 and a new token is returned).
  - **Integration** (`src/test/integration/initPayment.test.ts`): added two cases — calling `/init` twice with the same `transactionReferenceId` returns identical token/redirect on the second call; calling with two distinct IDs returns two different tokens. Minor field-name sync with PAY-290 in the existing happy-path test.

- 4f35f7a: Adds running-locally markdown, minor version updates for package.json
- 434fec2: PAY-270: Remove unused environment variables (`SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`) from `.env.example` and the README. Reframe the README to clarify that `.env` is for local development only — deployed environments get their configuration from Terraform (see [ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md)).

  Drops the README's env-var table in favor of `.env.example` as the single source of truth for which variables exist; explanations for the conceptual env-layer flags (`APP_ENV`, `NODE_ENV`, `LOCAL_DEV`, `LOG_LEVEL`) move into README prose, and inline comments are added to `.env.example` for variables whose purpose isn't obvious from the name.

  Also drops the dead `CERT_PASSPHRASE` field from the `ProcessEnv` type declaration in `src/types/environment.d.ts` and renames two misleading tests in `src/appContext.test.ts` (their names referenced `CERT_PASSPHRASE` but the actual code gate is `PRIVATE_KEY_SECRET_ID` + `CERTIFICATE_SECRET_ID`).

  Note: the per-fee `tcsAppId` (camelCase) DB field used in ~20 files is unrelated to the removed `TCS_APP_ID` env var and is unaffected. The `CERT_PASSPHRASE_SECRET_ID` variable that drives stg/prod mTLS via AWS Secrets Manager is also unaffected.

- 5f043c1: ### `POST /process` Guards

  Two new checks are evaluated after the existing authorization check in `processPayment.ts`, before the Pay.gov SOAP call is made:

  1. **Sibling check** — `TransactionModel.findPendingOrProcessedByReferenceId` queries for any other transaction row sharing the same `transactionReferenceId` with a `transactionStatus` of `"pending"` or `"processed"`. If found, throws `GoneError` with a message directing the client to use `getDetails`.
  2. **Status check** — if no sibling exists but the current transaction's `transactionStatus` is not `"initiated"`, throws `GoneError` with a simpler "token is no longer valid" message.

  Both guards are future-proofed: they become fully operational once the DB-write-after-process story lands and begins updating `transactionStatus` away from `"initiated"`.

  ### Errors / HTTP Status Codes

  - Added `src/errors/gone.ts` — `GoneError` class with `statusCode: 410`, following the same pattern as `ForbiddenError` and `NotFoundError`.
  - `handleError.ts` requires no changes — the existing `statusCode < 500` branch handles 410 generically.

  ### `TransactionStatus` Schema Consolidation

  **This is out of scope of 224, but doing it makes checking transactions to see if they are processed cleaner.**

  - `TransactionStatusSchema` (`src/schemas/TransactionStatus.schema.ts`) now uses lowercase values: `"received" | "initiated" | "processed" | "failed" | "pending"`.
  - `"processed"` replaces `"success"` to avoid confusion with `PaymentStatus` (`"success" | "failed" | "pending"`). Pay.gov's `"Success"` and `"Settled"` responses are translated to `"processed"` in `parseTransactionStatus`.
  - `DashboardTransactionStatusSchema` is removed from `TransactionDashboard.schema.ts`. `TransactionStatusSchema` is now used directly — including in `DashboardTransactionSchema.transactionStatus` and `TransactionModel`'s `TransactionStatus` type alias.
  - All DB write methods in `TransactionModel` (`createReceived`, `updateToInitiated`, `updateToFailed`) updated to use the canonical lowercase values.
  - `initPayment.ts` updated accordingly (`"received"` on create).

  ### API / Shared Schema

  - `GoneErrorSchema` added to `src/schemas/Error.schema.ts` and registered in `src/openapi/registry.ts`.
  - `POST /process` OpenAPI spec gains a `410` response entry.
  - `TransactionStatusSchema` example updated from `"Success"` to `"processed"`.

  ***

  ## Testing

  - `src/errors/gone.test.ts` — new unit tests for `GoneError` (custom message + default message).
  - `src/useCases/processPayment.test.ts` — three new tests covering: sibling in `pending` state, sibling in `processed` state, and current transaction not in `initiated` state. `beforeEach` mock updated to include `transactionStatus: "initiated"` so all existing happy-path tests continue to pass.
  - `src/lambdaHandler.test.ts` — new handler-level 410 test.
  - `src/useCases/parseTransactionStatus.test.ts` — assertions updated to lowercase (`"processed"`, `"failed"`, `"pending"`).
  - All other affected test files updated to use lowercase `TransactionStatus` values.

  ## Out of Scope / Follow-up Tickets

  - The sibling and status guards are no-ops until `processPayment` writes its outcome back to the DB — **PAY-226** (or equivalent write-after-process story)

- 54fe561: ### processPayment
  **updated to return transaction array returned from DB for both the success and fail cases**

  - `toTransactionSummary()` was removed from `getDetails.ts`, and placed in its own util file so we can use it for both `processPayment.ts` and `getDetails.ts`. See `src/utils/toTransactionRecordSummary.ts`.
  - Calls `findByReferenceId` after updating the DB (both on success and on `FailedTransactionError`) and returns the full `transactions` array alongside `paymentStatus`

  #### toTransactionSummary

  - Parameters were updated to pull transactionStatus from row, instead of a separate parameter.

  ### Seeding

  `generateTransactions` gained a `multiAttemptGroups` parameter. Each group produces a set of rows sharing `transactionReferenceId`, `feeId`, `clientName`, and base timestamp, with attempts spaced 20–60 minutes apart to reflect the 3-hour Pay.gov token window. `02_dummy_data.ts` seeds 10 groups of `['failed', 'success']` to populate the dev/CI environment with realistic multi-attempt data.

  ### Database

  `20260424164039_remove_idx_transactions_client_ref.ts`: The down function no longer restores the original full UNIQUE constraint on (client_name, transaction_reference_id). Once multi-attempt transactions exist it can never be safely re-added.

  ***

  ## Testing

  - `processPayment.test.ts` unit test was updated to mock `findByReferenceId` with representative row fixtures for each outcome: processed, failed, pending, and fault. `returnCode` was added to the mock failed row.
  - `processPayment.test.ts` integration test was refactored to test transactions with multiple attempts (separate case for succeeding on the second attempt to pay, and a case for failing on the first and second try.)

- d09c026: PAY-260: Persist Pay.gov response fields to the DB when getDetails polls pending transactions.
- d09c026: ### `GET /details/{transactionReferenceId}` — request validation, lookup, and DB-as-cache refresh

  The endpoint now matches its OpenAPI contract: keyed on `transactionReferenceId` (UUIDv4) instead of `payGovTrackingId`, returning the published `{paymentStatus, transactions[]}` response shape. When the obligation is already resolved (`success`/`failed`), Pay.gov is not called — the DB is authoritative.

  #### Behavior changes

  - **Path parameter is now `transactionReferenceId`** (UUIDv4). Previously the handler read `payGovTrackingId`.
  - **Lookup uses `TransactionModel.findByReferenceId`** — a new finder ordered by `createdAt asc`, returning all rows for a given `transactionReferenceId`.
  - **Response shape now matches `GetDetailsResponseSchema`** — `{paymentStatus, transactions: TransactionRecordSummary[]}` instead of the previous flat `{trackingId, transactionStatus}`.
  - **DB-as-cache short-circuit:** the obligation's `paymentStatus` is derived from the cached DB rows first. If it's `success` or `failed`, the response is built from cached data and Pay.gov is not contacted.
  - **Pay.gov SOAP refresh** is now scoped to the `pending` path only, and within that path only fires for rows with a `paygovTrackingId` AND a non-terminal `transactionStatus`. SOAP failures for a single attempt are caught and logged; the cached status for that row is returned so one bad attempt doesn't poison sibling responses.
  - **Single fee lookup per request** — per Fee-invariance (all attempts under a `transactionReferenceId` share the same `feeId`), `FeesModel.getFeeById` is called once using `rows[0].feeId`.
  - **Refresh produces new objects** rather than mutating `TransactionModel` instances — keeps DB rows immutable for any downstream reader.

  #### Errors / HTTP Status Codes

  | Case                                                     | Status | Error class           | Message                                                                                 |
  | -------------------------------------------------------- | ------ | --------------------- | --------------------------------------------------------------------------------------- |
  | Path param missing or not a UUID                         | 400    | `InvalidRequestError` | `"Transaction Reference Id was invalid"`                                                |
  | `transactionReferenceId` valid but no transaction exists | 404    | `NotFoundError`       | `"Transaction Reference Id was not found"`                                              |
  | Fee row missing OR `tcsAppId` missing on fee             | 500    | `ServerError`         | (server-side data corruption — diagnostic logged to CloudWatch, not leaked in response) |

  `getDetails` does not authorize by `clientName`: UUIDv4 collision across clients is infeasible (~1 in 5×10³⁶), so the lookup keyed on `transactionReferenceId` alone is sufficient.

  All routed by the existing `handleError` `statusCode < 500` branch — no `handleError` changes needed.

  ### `POST /init` — TOCTOU-safe duplicate prevention

  Two-layer protection against concurrent `initPayment` calls for the same `(clientName, transactionReferenceId)`:

  - **App-level** (fast path, common case): pre-create check via new `TransactionModel.findInitiatedByReferenceId` → `ConflictError` (409).
  - **DB-level** (race path): a new partial unique index `idx_transactions_unique_active` rejects concurrent `createReceived` inserts. A new `isUniqueViolation` helper in `src/db/pgErrors.ts` detects pg `SQLSTATE 23505` and `initPayment` converts it to the same `ConflictError` so callers see a consistent 409 regardless of which layer caught the duplicate.

  #### New error class

  - `ConflictError` (`src/errors/conflict.ts`) — `statusCode: 409`. Same shape as the existing error classes, routed by `handleError` automatically.

  ### Database (PAY-294)

  New forward migration `db/migrations/20260424164039_remove_idx_transactions_client_ref.ts`:

  - **Removes** the full `(client_name, transaction_reference_id)` unique constraint. Multiple historical attempts for one obligation are now allowed (enables retries after a failure).
  - **Adds** a partial unique index `idx_transactions_unique_active ON (client_name, transaction_reference_id) WHERE transaction_status IN ('received', 'initiated', 'pending')`. Caps at most one in-flight attempt per obligation while leaving terminal/historical rows unbounded — covers every non-terminal status so the partial index and the app-level pre-check stay aligned.
  - **Keeps** a regular composite index on `(client_name, transaction_reference_id)` for query performance.
  - Idempotent (`DROP CONSTRAINT IF EXISTS` + `CREATE INDEX IF NOT EXISTS`) so it runs cleanly against any environment.

  New finders on `TransactionModel`:

  - `findByReferenceId(refId)` — used by `getDetails` to fetch all attempts for an obligation.
  - `findInFlightByReferenceId(refId)` — used by `initPayment` as the app-level pre-check; matches the same `('received', 'initiated', 'pending')` set as the partial unique index.

  ### API / Shared Schema

  - New `GetDetailsPathParamsSchema` (UUIDv4, strict) and `ConflictErrorSchema`, both registered in `src/openapi/registry.ts`.
  - `/details/{transactionReferenceId}` references `GetDetailsPathParamsSchema` for the path param (was an inline `z.string()`), gains a `404` response, and updates `400`/`403` descriptions for the new validation/auth semantics.
  - `/init` gains a `409` response for the new conflict path.
  - `derivePaymentStatus` made generic — accepts any array of objects with a `transactionStatus` field. New companion `derivePaymentStatusFromSingleTransaction(status)` for callers evaluating a single status (`processPayment` adopts this).
  - Regenerated `docs/openapi.json` and `docs/openapi.yaml`.

  ### Infrastructure

  - `terraform/modules/api-gateway/main.tf`: path part renamed to `{transactionReferenceId}`. Added all path resource IDs to `aws_api_gateway_deployment.deployment.triggers` so future path-part changes force a fresh stage snapshot — without this, the stage kept serving stale routing despite the resource being updated.
  - `src/devServer.ts` local route updated to match the deployed contract.

  ### Data

  - `db/seeds/data/transactions.ts` now generates `transaction_reference_id` as UUIDv4 (via `faker.string.uuid()`) instead of the legacy `TXN-REF-XXXXXXXXX` format. Required so locally seeded rows are queryable through the validated endpoint.

  ### Docs

  - New design doc `docs/architecture/proposals/getDetails-paygov-concurrency.md` capturing the remaining Pay.gov fan-out concern and the three options for resolution. Sequential refresh recommended.

  #### Testing

  - `src/db/TransactionModel.test.ts` — new tests for `findByReferenceId` (empty result, single match) and `findInitiatedByReferenceId`.
  - `src/useCases/getDetails.test.ts` — rewritten for the new contract. Covers `NotFoundError` (no rows), `ServerError` (misconfigured fee — both fail modes), terminal-status short-circuit (no SOAP call), non-terminal without `paygovTrackingId` (no SOAP call), non-terminal refresh with Pay.gov response, SOAP-failure-per-attempt handling, and multi-row aggregation.
  - `src/useCases/initPayment.test.ts` — new tests for both layers of the conflict guard: app-level pre-check returns 409, and DB-level pg `23505` violation converts to 409.
  - `src/lambdaHandler.test.ts` — `getDetailsHandler` tests updated for the new response shape + path param. Added 400 (invalid UUID, missing/undefined params) and 404 (`NotFoundError` propagation). Existing 403/`ForbiddenError`-propagation routing test is retained at the handler level even though `getDetails` no longer raises it.
  - `src/utils/derivePaymentStatus.test.ts` — added `derivePaymentStatusFromSingleTransaction` coverage.
  - `src/test/integration/getDetails.test.ts` — new integration test covering 400 on invalid UUID, 404 on not-found UUID, and reaching-Lambda smoke check.
  - `src/test/integration/transaction.test.ts` — end-to-end test now drives `/details` via `transactionReferenceId` and asserts the new response shape.
  - **257 unit tests passing**; integration tests verified against PR-197.

  ## Out of Scope / Follow-up

  - **Bound Pay.gov SOAP concurrency in `refreshPendingAttempts`** — `Promise.all` fan-out remains for `pending` obligations with N > 1 attempts. Sequential processing recommended in the new design doc. **PAY-###**
  - **Enforce Fee-invariance** at the `initPayment` or DB layer (currently convention, not enforced).
  - **Retry queue / async status reconciliation** — would replace the synchronous Pay.gov refresh entirely. Not planned in this work; mentioned for context.

- 24b7c54: PAY-290: Make the integration test suite reproducible locally with parity to PR GitHub Actions.

  - `devServer.ts` now validates `/init` and `/process` request bodies against the same Zod schemas as the Lambda handler, returning the same 400 error shape (missing body, invalid JSON, validation error). Validation is centralized in a `parseRequestBody` helper that mirrors `lambdaHandler.ts`'s `parseAndValidate`.
  - The `init`, `process`, and `transaction` integration suites now run locally without SigV4: their `describeWithEnv` gate runs whenever `BASE_URL` is set, and they pick `fetch` vs `signedFetch` via `isLocal()` from `src/config/appEnv.ts` (`APP_ENV=local` locally, `APP_ENV=dev` in CI).
  - The `sigv4Smoke` suite is skipped locally — every block now gates on `describeWithCreds`, and the `test:integration:dev` script also passes `--testPathIgnorePatterns=sigv4Smoke.test.ts` as a belt-and-suspenders skip.
  - New `npm run test:integration:dev` script (`APP_ENV=local …`) and a "Running integration tests locally" section in `running-locally.md` document the local workflow end-to-end.
  - Drive-by fix: `migration.test.ts` schema-shape assertion picked `body.data[0]`, which is now a pending row (transactions left behind by PAY-291's expanded scenarios). Since `paymentMethod` is `.optional()` in `TransactionDashboard.schema.ts` and omitted from pending rows, the assertion failed against the deployed env. Now asserted against a non-pending row.

- 552779c: ## What Changed?

  ### GetDetails Use Case

  Previously, when the Pay.gov refresh inside `getDetails` failed for any of three reasons — schema validation (ZodError), SOAP/network error, or a DB write rejection — the failure was silently logged and stale data was returned to the client.

  `getDetails` is a read; a refresh failure means our source of truth is temporarily unreachable, not that the underlying transaction failed. The use case now:

  - **SOAP/Zod/parse failure on the refresh:** throw `PayGovError(500)` with a retry-encouraging message. The row's state is left untouched — it stays `pending` until Pay.gov is reachable and we can confirm a definitive status.
  - **DB failure on `updateAfterPayGovResponse`:** same — throw `PayGovError(500)`. We had a fresh Pay.gov status but couldn't persist it; the next call will re-fetch and re-persist.

  We deliberately do **not** call `updateToFailed` here: marking a `pending` row as `failed` because Pay.gov is briefly unreachable would conflate "we don't know" with "it failed," and a real success would become a false failure once Pay.gov came back online.

  ### GetDetailsRequest entity

  - Added Zod validation of the Pay.gov response shape against `PayGovGetDetailsResponseSchema`.
  - The previous bare `Error("Could not find any transaction details")` is replaced by schema rejection (empty `transactions` array fails `.nonempty()`).
  - `TransactionDetails.transaction_amount` corrected from `string` to `number` to match what the XML parser actually produces.
  - Removed the `console.log("getDetails api response", response)` debug line on the success path. The schema-failure path retains a structured `console.error` with the raw response for on-call diagnosis; the success-path log was untyped noise.

  ### PayGovError

  - `statusCode` is now an optional constructor argument (default `504`, preserving existing `initPayment` behavior). `getDetails` passes `500` per acceptance criteria.

  ### Schemas

  - New `PayGovGetDetailsResponse.schema.ts` (Pay.gov inbound SOAP response — distinct from the existing outbound `GetDetails.schema.ts`).
  - The schema validates only the two fields the use case actually consumes (`paygov_tracking_id`, `transaction_status`); `agency_tracking_id`, `transaction_amount`, and the date/payment_type fields are optional. The dev Pay.gov fake omits some of the strict-required fields the original schema specified, and we don't read those fields downstream anyway — the DB row already has them.

  ### Testing

  - `getDetails.test.ts` failure-path tests rewritten — they previously asserted the bug ("logs and continues"); they now assert the correct fail-fast contract, including the multi-row partial-write-then-throw case.
  - `GetDetailsRequest.test.ts` extended with ZodError cases and migrated to `jest.spyOn` + `restoreAllMocks`.
  - `payGovError.test.ts` and `handleError.test.ts` extended for the configurable statusCode.

- c09689e: ## What Changed?

  ### initPayment Use Case

  **SOAP Call Try-Catch**

  - Log a console error with details if marking the row as failed in the DB fails.
  - If the SOAP call fails, handle it in the `catch` statement by logging the details in a console error, and throw a `PayGovError` back to the user, encouraging a retry.

  **Mark as Initiated in DB Try-Catch**

  - Mark as failed in DB if marking as Initiated fails, and if marking it as `failed` fails, log a console error with details.
  - Log a console error with details if `updateToInitiated` fails, and throw a ServerError back to the user. (This is where the custom messaging in handleError for ServerErrors get used.)

  ### handleError

  - Added a specific error case for `ServerError` that allows us to give the client. a custom message for it in the response.

  ### Testing

  **InitPayment Unit Test Cases:**

  - `updates transaction to failed if SOAP request fails`
  - `still throws PayGovError if updateToFailed itself rejects when SOAP request fails`
  - `calls updateToFailed and throws ServerError when updateToInitiated fails`
  - `throws PayGovError when Pay.gov SOAP request fails with a network error`
  - `throws PayGovError with the generic retry message when Pay.gov returns an unparseable response (ZodError, handled by base case of catch)`

  **HandleError Unit Test Cases**

  - Unit tests updated to account for new `ServerError` case of `handleError.ts`

- 117a044: PAY-282: Fix deploy-to-dev by adding ssm:DescribeParameters IAM permission and fix SigV4 smoke test to use GET /test
- 04a7d8c: Dependency updates and audit fixes.

## 0.1.3

### Patch Changes

- 597abb4: align supported node engine range with ef-cms (Node 24.12)

## 0.1.2

### Patch Changes

- ee9199f: testing ci pipeline run

## 0.1.1

### Patch Changes

- a1dd736: Finalize npm publish setup: CI/Publish workflows, changesets init, build to dist"
