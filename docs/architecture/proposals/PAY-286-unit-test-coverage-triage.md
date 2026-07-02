# PAY-286 Unit Test Coverage Triage

## Context

Coverage was reviewed from the existing `coverage/coverage-final.json` artifact and a fresh `npm run test:coverage` run on 2026-07-02. That run still produces usable coverage data, but it currently fails in `scripts/check-local-flow.test.js`, so the gaps below were triaged from the generated coverage output rather than from a clean green run.

The highest remaining gaps are concentrated in the DB/config layer. Most of those are thin query wrappers or import-time wiring and should not automatically become backlog work. The goal here is to separate real behavior worth unit testing from coverage noise that should be suppressed with `/* istanbul ignore next */`.

## Recommended Unit Test Backlog

1. `src/db/getRdsCredentials.ts`

   This file has real logic and currently has no meaningful unit coverage. The valuable cases are malformed `RDS_ENDPOINT` parsing, missing required env vars, missing `username` or `password` in the secret payload, cache reuse, and CA-bundle selection. These tests would protect deploy-time configuration behavior, not just raise percentages.

2. `src/db/TransactionModel.ts`

   Most query methods are thin wrappers and are not worth ticketing, but there are three load-bearing behaviors worth direct unit coverage: `getAggregatedPaymentStatus()` ignoring unknown statuses while still computing `total`, `createReceived()` enforcing `paymentStatus='pending'` and `transactionStatus='received'` regardless of caller input, and `updateAfterPayGovResponse()` omitting empty date fields instead of patching invalid timestamp values.

3. `src/clients/permissionsClient.ts`

   `getClientPermissions()` is already well covered, but `getClientByRoleArn()` is not. Add tests for the successful lookup path and the `ForbiddenError("Client not registered")` path so authorization failures are covered at the client lookup boundary.

4. `src/appContext.ts`

   The retry wrapper around Pay.gov calls still has meaningful uncovered behavior. The useful cases are: a non-retryable fetch error is rethrown immediately without retrying, retryable errors exhaust both attempts and log the terminal `paygov_retry_exhausted` event, and the mTLS branch builds the HTTPS agent with normalized PEM content and optional passphrase handling.

5. `src/useCases/getDetails.ts`

   Most happy-path and common failure cases are already tested, but a few business-protection branches remain. The best additions are: throwing `ServerError` when more than one pending attempt exists for the same reference ID, preserving the stored payment method when Pay.gov returns an empty or unrecognized `payment_type`, and surfacing `PayGovError` when Pay.gov refresh succeeds but DB persistence fails.

6. `scripts/check-local-flow.js`

   This is not a net-new behavior gap so much as a flaky/stale unit harness around a smoke-check script. The current script still auto-runs at module load, and the current test file still covers the right broad scenarios, but it is out of sync in at least one concrete place: it sets `FEE_ID` even though the script reads `FEE`. A focused follow-up should stabilize this suite and restore trustworthy coverage around the `/init` failure path, `/pay` failure path, unknown fee selection, and `paymentRedirect` token parsing.

## Good Candidates For `/* istanbul ignore next */`

- `src/db/FeesModel.ts` thin Objection query wrappers and relation-mapping boilerplate.
- The thin query-wrapper methods in `src/db/TransactionModel.ts` such as `getAll()`, `getByPaymentStatus()`, `findByPaygovToken()`, `findByPaygovTrackingId()`, and `findByReferenceId()`, when the branch in question is only query construction already covered by integration flow.
- `src/db/knex.ts` import-time singleton initialization and cache-return branches. These are wiring concerns and are brittle to unit test at the module-loader level.
- `src/utils/logger.ts` request-logger passthrough methods that only forward `(additionalFields ?? {}, message)` to pino child methods.
- `src/errors/failedTransaction.ts` default-constructor branch on a trivial error subclass.
- Schema/OpenAPI boilerplate branches in `src/schemas/InitPayment.schema.ts` and `src/schemas/TransactionDashboard.schema.ts` that exist only because of wrapper composition, not business logic.
- Shutdown bookkeeping in `scripts/start-local-stack.js` and docker log-stream callback branches in `scripts/lib/docker.js` where the missing coverage is mostly signal handling and process lifecycle glue.

## Notes For AC #2 Summary

- The strongest tech-debt ticket candidates are `getRdsCredentials`, `TransactionModel`'s nontrivial data-shaping methods, `getClientByRoleArn`, `appContext` retry behavior, `getDetails` pending-refresh edge cases, and the unstable `check-local-flow` unit suite.
- The DB-layer coverage percentage is currently inflated by low-value wrappers. Those should be suppressed with targeted `/* istanbul ignore next */` comments rather than converted into brittle mock-heavy tests.
- Before making any ignore pass, fix or intentionally replace the failing `scripts/check-local-flow.test.js` harness so `npm run test:coverage` becomes trustworthy again.
