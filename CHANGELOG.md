# @ustaxcourt/payment-portal

## 0.1.4

### Patch Changes

- 014abbd: PAY-271: PR environment RDS isolation — each PR gets its own database for integration testing
- e54887e: - Updated FK constraint for `fee_id` as NOT VALID so Postgres skips the historical row check (fees table is empty at migration time; 01_reference_data seeds it after);

  - inlined known fee amounts in the transaction_amount backfill for the same reason.

  - Validate **POST** `/process` requests — tighten ProcessPaymentRequestSchema with `.strict()` (reject unknown fields) and `.min(1)` (reject empty token strings), matching the pattern already established for /init.
  - Standardize error responses — handleError now returns a consistent { message, errors } JSON envelope for all error types (Zod validation, InvalidRequestError, PayGovError, and generic 500s), replacing the previous mix of plain text and JSON
  - Extract shared parseAndValidate helper in `lambdaHandler.ts` — both initPaymentHandler and processPaymentHandler now use the same JSON-parse + Zod-validation pipeline with a discriminated union return type (ParseResult<T>) for proper type narrowing (eliminates non-null assertions)

  - Align OpenAPI docs — added `ValidationErrorResponseSchema` and `GatewayErrorSchema`; updated `/process` 400 response from text/plain to application/json and added 504 response using `GatewayErrorSchema` to match what the API actually returns; regenerated openapi.json and openapi.yaml

  - Comprehensive test coverage — unit tests cover missing body, empty body, malformed JSON, missing token, wrong type, empty token, too-short token, unknown fields (with unrecognized_keys assertion), PayGovError propagation, and generic 500; integration tests cover malformed JSON, missing token, and unknown fields against the deployed endpoint

- 39c35ba: PAY-219: initPayment returns Pay.gov token and computed redirect URL with 504/500 error handling
- 4f35f7a: Adds running-locally markdown, minor version updates for package.json
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

- 117a044: PAY-282: Fix deploy-to-dev by adding ssm:DescribeParameters IAM permission and fix SigV4 smoke test to use GET /test

## 0.1.3

### Patch Changes

- 597abb4: align supported node engine range with ef-cms (Node 24.12)

## 0.1.2

### Patch Changes

- ee9199f: testing ci pipeline run

## 0.1.1

### Patch Changes

- a1dd736: Finalize npm publish setup: CI/Publish workflows, changesets init, build to dist"
