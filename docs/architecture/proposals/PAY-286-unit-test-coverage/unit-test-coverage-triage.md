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

The recent ignore pass landed in the kinds of places this triage originally called out: low-value wiring, lifecycle glue, and rare defensive failure paths that do not justify brittle unit harnesses.

- `scripts/start-local-stack.js` now suppresses top-level runtime detection, shutdown bookkeeping, and the optional crash-hint branch in the child-process exit handler. Those gaps were process lifecycle glue rather than product behavior.
- `scripts/lib/docker.js`, `scripts/ensure-test-db.js`, and `scripts/check-local-flow.js` now suppress CLI-only or callback-only branches where coverage depended on difficult-to-simulate process, stream, or failure behavior rather than meaningful business logic.
- `src/schemas/InitPayment.schema.ts` and `src/schemas/TransactionDashboard.schema.ts` now suppress schema-composition branches that exist because of wrapper/OpenAPI boilerplate rather than real domain decisions.
- `src/utils/logger.ts` now suppresses rare misconfiguration or transport-failure branches in logging setup, while the normal logging behavior remains covered elsewhere.
- `src/useCases/getDetails.ts`, `src/useCases/processPayment.ts`, and `src/utils/safeUpdateToFailed.ts` now suppress narrow defensive branches for follow-on refresh or persistence failures that are possible in production but expensive to unit-test directly.
- `src/testCert.ts` now suppresses the health-probe-only branch that exists for operational resiliency rather than ordinary request flow.
- `src/useCases/initPayment.ts` also now contains targeted ignore comments on exceptional branches. Those paths should still be reviewed carefully over time because they sit closer to business flow than the pure wiring cases above, but the current ignores are narrower than carrying forward brittle tests solely for percentage gains.

The remaining principle is unchanged: use ignore comments only where the uncovered line is import-time wiring, process lifecycle glue, schema boilerplate, or an intentionally defensive edge path whose test harness would be disproportionately complex.

## Notes For AC #2 Summary

- The strongest tech-debt ticket candidates are `getRdsCredentials`, `TransactionModel`'s nontrivial data-shaping methods, `getClientByRoleArn`, `appContext` retry behavior, `getDetails` pending-refresh edge cases, and the unstable `check-local-flow` unit suite.
- The DB-layer coverage percentage is currently inflated by low-value wrappers. Those should be suppressed with targeted `/* istanbul ignore next */` comments rather than converted into brittle mock-heavy tests.
- Before making any ignore pass, fix or intentionally replace the failing `scripts/check-local-flow.test.js` harness so `npm run test:coverage` becomes trustworthy again.
