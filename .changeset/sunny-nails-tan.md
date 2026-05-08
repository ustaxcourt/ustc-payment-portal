---
"@ustaxcourt/payment-portal": patch
---

PAY-290: Make the integration test suite reproducible locally with parity to PR GitHub Actions.

- `devServer.ts` now validates `/init` and `/process` request bodies against the same Zod schemas as the Lambda handler, returning the same 400 error shape (missing body, invalid JSON, validation error). Validation is centralized in a `parseRequestBody` helper that mirrors `lambdaHandler.ts`'s `parseAndValidate`.
- The `init`, `process`, and `transaction` integration suites now run locally without SigV4: their `describeWithEnv` gate runs whenever `BASE_URL` is set, and they pick `fetch` vs `signedFetch` via `isLocal()` from `src/config/appEnv.ts` (`APP_ENV=local` locally, `APP_ENV=dev` in CI).
- The `sigv4Smoke` suite is skipped locally — every block now gates on `describeWithCreds`, and the `test:integration:dev` script also passes `--testPathIgnorePatterns=sigv4Smoke.test.ts` as a belt-and-suspenders skip.
- New `npm run test:integration:dev` script (`APP_ENV=local …`) and a "Running integration tests locally" section in `running-locally.md` document the local workflow end-to-end.
- Drive-by fix: `migration.test.ts` schema-shape assertion picked `body.data[0]`, which is now a pending row (transactions left behind by PAY-291's expanded scenarios). Since `paymentMethod` is `.optional()` in `TransactionDashboard.schema.ts` and omitted from pending rows, the assertion failed against the deployed env. Now asserted against a non-pending row.
