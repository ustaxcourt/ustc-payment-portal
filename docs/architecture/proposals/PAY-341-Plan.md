# PAY-341 Plan
1. We need to write a migration removing the Fees Table
  - Don't forget about the transactions constraint `FK feeId fees -> transactions`.
2. We need to remove the 01_Reference_Data Seed.
3. Figure out where the Fees should exist in code.
4. Refactor FeeModel out along with it's test file
  - We still need `getActiveFeeByKey` and `getFeeById` in the new home for Fees
5. Refactor where Fees get pulled from model.
6. Dummy Data refactor to account for changing how Fees work. (if needed)
7. Swagger Update and Schema Changes (FeeId and FeeKey)
  - `FeeId` stays as a distinct type but is derived from `keyof typeof FEES` rather than a manually maintained enum — removes the sync burden and the TODO in `FeeId.schema.ts`
  - `FeeKey` schema similarly derives its enum from the unique `feeKey` values in the FEES object so there is one place to update when a fee is added
8. `TransactionModel` cleanup
  - Remove the Objection `relationMappings` entry pointing at the fees table
  - Remove the JOIN on `fees` in any raw queries (e.g. `getAll`, `getByReferenceId`)
9. Delete `FeesModel.getAll()` — only referenced in its own test, no live callers
10. SSM Parameter Store for `tcsAppId`
  - `tcsAppId` is sensitive in prod and must not be committed to the repo
  - Store one SecureString parameter per fee key, e.g. `/payment-portal/{env}/tcs-app-id/PETITION_FILING_FEE`
  - Add a new `src/clients/ssmClient.ts` to fetch and cache parameters at Lambda cold start
  - Terraform: provision the SSM parameters and add `ssm:GetParameter` to the Lambda IAM role policy in `terraform/modules/iam/role-lambda.tf`
  - `tcsAppId` is omitted from `src/fees.ts`; the SSM client resolves it at runtime by fee key

## Design Decisions

- **Location**: `src/fees.ts` at the src root. No dedicated folder — YAGNI; create one if a second piece of reference data emerges.
- **Structure**: a plain `const FEES` dict keyed by `feeId`. Each entry holds `feeKey`, `amount`, `name`, `description`, and `activationDate` — no `tcsAppId` (resolved separately via SSM). When a fee version changes, a new entry is added (new `feeId`, same `feeKey`, later `activationDate`); old entries are never removed so past transactions remain resolvable.
- **Access functions**: sync module-level functions in `src/fees.ts`, each accepting `tcsAppIds: Record<FeeKey, string>` (from `AppContext`) alongside the lookup key:
  - `getActiveFeeByKey(feeKey, tcsAppIds)` — filters by `feeKey`, sorts by `activationDate` descending, merges in `tcsAppId`, returns a complete fee object
  - `getFeeById(feeId, tcsAppIds)` — direct `FEES[feeId]` lookup, merges in `tcsAppId`, returns a complete fee object
  - All fee logic stays in `src/fees.ts`; `AppContext` is a dumb data carrier; use cases make one call and get a complete fee object
- **AppContext**: gains a `getTcsAppIds(): Promise<Record<FeeKey, string>>` method, following the same lazy-cache pattern as the existing `getHttpsAgent()`. The SSM client holds a module-level cache populated on first call; warm invocations return the cached value. Use cases `await ctx.getTcsAppIds()` then pass the result into the fee functions.
- **No class**: the Objection model class is eliminated entirely; use cases import the two functions directly from `src/fees.ts`
- **FK drop**: `transactions.feeId` becomes a plain string column with no DB-enforced FK. The code registry is the source of truth for resolving historical fee versions.
