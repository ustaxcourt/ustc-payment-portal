# PR Review — PAY-284: Fee Versioning

## TL;DR

**Solid structural change, but not ready to merge.** The data model is right, the migration is correct (with one subtle gap), and the rename surface is mostly clean. But there are at least **three concrete bugs** (a stale `feeId` in devServer logging, a typo in the initPayment test fixture, dead code in the lambda handler signature), **two material gaps in test coverage** (no test for `getActiveFeeByKey` ordering — the whole point of the ticket, and no migration test asserting the schema changes), and a **missing changeset** for what is explicitly a breaking-change PR. The Secrets Manager rollout story also changed mid-flight — the plan said "secret update must precede deploy," then a backward-compat shim was added, and the plan wasn't updated to reflect that.

---

## What's solid

1. **Schema design.** `fee_key` + `activation_date` with `UNIQUE (fee_key, activation_date)` is the right shape — no `is_active` boolean to drift, no separate `fee_versions` table to JOIN. "Most-recent activation_date that's not in the future" is unambiguous.
2. **Migration safety.** Adding `fee_key` nullable → backfill → enforce NOT NULL is the textbook two-phase pattern. `down` migration is symmetric and re-derives `transaction_amount` from the join, which is exactly correct for rollback.
3. **`getActiveFeeByKey` query.** `WHERE feeKey = ? AND activationDate <= NOW() ORDER BY activationDate DESC LIMIT 1` is right. The `<=` (not `<`) handles fees activated at the exact current moment.
4. **`fee_id` as version-specific FK on `transactions`.** This is the load-bearing decision: storing the *version* (`PETITION_FILING_FEE_2`) not the key means the historical amount is always recoverable via the join, even after future versions are added. Drops the redundant `transaction_amount` column without losing reporting capability.
5. **Backward-compat coercion in `permissionsClient`.** Reading `allowedFeeIds` and renaming to `allowedFeeKeys` at parse time eliminates the brittle "secret-then-deploy ordering" constraint the original plan called out. Good defensive choice.
6. **`processPayment` / `getDetails` auth re-order.** Loading the fee first, then authorizing with `fee.feeKey`, is the right fix for the bug where `transaction.feeId` (version-specific) wouldn't match `allowedFeeKeys` (key-only).

---

## Bugs

### Bug 1 — Stale `feeId` in devServer logging

[devServer.ts:89](../src/devServer.ts#L89):

```ts
logger.info({
  feeId: req.body?.feeId,            // always undefined now — schema field is `fee`
  transactionReferenceId: req.body?.transactionReferenceId,
}, "Received /init request");
```

The InitPayment schema renamed `feeId → fee`, but the structured-log field still reads `req.body?.feeId`. This will always be `undefined` in the dev logs going forward. Commit `01b6f1a` ("devServer update for FeeKeys change") fixed the `allowedFeeKeys` line in the same file but missed this one. **Fix**: `fee: req.body?.fee`.

### Bug 2 — Typo in initPayment test fixture

[initPayment.test.ts:31](../src/useCases/initPayment.test.ts#L31):

```ts
if (feeKey === "NONATTORNEY_EXAM_REGISTRATION_FEE") {
  return Promise.resolve({
    fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",   // ← should be `feeId:`
    feeKey: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    tcsAppId: "TCSUSTAXCOURTANAEF",
    ...
```

The PETITION mock (line 22) correctly uses `feeId:`. The application code reads `fee.feeId` at [initPayment.ts:93](../src/useCases/initPayment.ts#L93) to populate the transaction's FK. With this typo, the NONATTORNEY test branch is silently storing `undefined` as the FK — the test passes only because the mock for `createReceived` doesn't actually verify the FK was set. This is a fixture bug that hides a real assertion gap. **Fix**: `fee:` → `feeId:` in the mock; add `expect(TransactionModel.createReceived).toHaveBeenCalledWith(expect.objectContaining({ feeId: "..." }))` to both fee-type tests.

### Bug 3 — Dead `feeId` param in `lambdaHandler`

[lambdaHandler.ts:27-44](../src/lambdaHandler.ts#L27-L44):

```ts
const lambdaHandler = async <T>(
  request: T,
  requestContext: APIGatewayEventRequestContext,
  callback: LambdaHandler<T>,
  feeId?: string,    // ← never read in the body
) => { ... }
```

And [lambdaHandler.ts:99](../src/lambdaHandler.ts#L99):

```ts
return lambdaHandler(
  result.value,
  event.requestContext,
  appContext.getUseCases().initPayment,
  result.value.fee,   // ← passed to a no-op param
);
```

PAY-301 moved the fee-authorize call from `lambdaHandler` into the use case, leaving this parameter behind. This PR renames the value being passed (`feeId` → `fee`) but doesn't drop the dead parameter. **Fix**: remove `feeId?: string` from the signature and the trailing argument from `initPaymentHandler`. Three callsites — small, safe cleanup.

---

## Test gaps that matter

### Gap 1 — Zero coverage of `getActiveFeeByKey` ordering

This method is the central new behavior of the ticket — pick the most recent active version. Yet:

- [FeesModel.test.ts](../src/db/FeesModel.test.ts) only covers `getAll` and `getFeeById`. The mock class doesn't even include `getActiveFeeByKey`.
- No integration test seeds two versions of the same `fee_key` and asserts the newer one is picked.
- No test asserts a future-dated row is excluded (`activation_date > NOW()`).

If `ORDER BY activationDate ASC` slipped in, or `<=` became `<`, no test would catch it. The whole ticket would silently regress. **Action**: at minimum, add a unit test for `getActiveFeeByKey` that asserts `where('feeKey', ...)`, the `<=` predicate, the `DESC` order, and `.first()` are wired correctly. Better: add an integration test that seeds three versions (past, present, future) and asserts the right row is returned.

### Gap 2 — Migration test doesn't assert the schema delta

The plan called for `migration.test.ts` to "assert `transaction_amount` column is absent; assert `fee_key` and `activation_date` exist on `fees`." Neither assertion exists in [migration.test.ts](../src/test/integration/migration.test.ts). The test still references `transactionAmount` as a property on the row — but only because it's now derived via JOIN. If the JOIN alias were removed accidentally, the test would tell you nothing about whether the column was correctly dropped.

**Action**: add explicit `INFORMATION_SCHEMA` assertions for the column add/drop.

### Gap 3 — No test for the `permissionsClient` backward-compat coercion

The commit message ("temporarily allow both feeIds and feeKeys") promised tests were added — and 16 lines did land in `permissionsClient.test.ts`. But this is a **load-bearing operational shim**: the deploy ordering safety hinges on it working correctly. Worth verifying the test covers (a) `allowedFeeIds`-only → coerced, (b) `allowedFeeKeys`-only → passes through, (c) both present → `allowedFeeKeys` wins, (d) neither present → throws.

---

## Design concerns / behavior changes worth a second look

### 1. `initPayment` authorize-before-lookup vs `processPayment` lookup-before-authorize

The two use cases now have **opposite ordering**:

- `initPayment` ([line 37-39](../src/useCases/initPayment.ts#L37-L39)): `authorizeClient(client, feeKey)` → then `getActiveFeeByKey(feeKey)`
- `processPayment` ([line 51-61](../src/useCases/processPayment.ts#L51-L61)): `getFeeById(...)` → then `authorizeClient(client, fee.feeKey)`
- `getDetails`: same as `processPayment`

The `processPayment`/`getDetails` ordering is forced (need `fee.feeKey` to authorize). The `initPayment` ordering is a choice — and a defensible one (don't leak fee-existence to unauthorized clients).

The behavioral consequence: a typo'd fee key from a non-wildcard client now returns **403 "Client not authorized for fee"** in initPayment, but would have returned **400 "Unknown fee"** before. Two effects:

- Legitimate clients with a typo get a misleading 403 (bad support experience).
- A client with no permissions can't probe the fee-key namespace via 400/403 differentiation (mildly better security).

Worth a deliberate decision, not an accident. If the plan didn't call out this UX change, surface it in the PR description; consider whether the support pain is worth the leak-prevention.

### 2. `transactionAmount` is a join alias without a model declaration

[TransactionModel.ts](../src/db/TransactionModel.ts) removed the `transactionAmount!: number` property declaration but kept `parsed.transactionAmount = Number(parsed.transactionAmount)` in `$parseDatabaseJson`, and the JOIN queries still alias `f.amount as transactionAmount`. This works at runtime — but TypeScript callers can't access `row.transactionAmount` cleanly because the model class doesn't declare the field.

Search hits suggest the consumers (`getAll`, `getByPaymentStatus`) feed the result into the `TransactionDashboard.schema.ts` Zod parser, which probably re-types via inference. So it doesn't blow up. But it's a sharp edge — anyone writing `transaction.transactionAmount` in new code will get a TS error and won't know why. Consider either:

- Add `transactionAmount?: number` to the model with a JSDoc note: *"populated by dashboard join queries only; null for direct lookups"*, OR
- Add a typed `DashboardTransaction` type that extends the base model.

### 3. `fees.ts` is dead code

[src/fees.ts](../src/fees.ts) is no longer imported anywhere — `getFeeConfig` has zero callers. The comment says *"kept for reference only"*, but version control is the reference. Dead code rots. **Delete it.**

### 4. Plan-vs-implementation mismatch on Secrets Manager rollout

The plan ([PAY-284-plan.md:155-204](../PAY-284-plan.md)) is emphatic: "secret update **must precede** code deploy." Then the backward-compat shim was added (`81df0f2`), which makes that ordering optional — code can ship before the secret update without breaking. That's a better design, but **the plan still says the old thing**.

This matters because reviewers/ops will read the plan and follow steps that are now overly cautious (or, worse, draw incorrect conclusions about rollback safety). **Action**: update the plan to say "ordering is not strictly required due to the parse-time coercion in `permissionsClient.ts`; secrets can be updated on a separate cadence." Note the coercion is **temporary** — flag a follow-up ticket to remove it after all environments have migrated, otherwise it lives forever.

---

## Operational / rollout

1. **Missing changeset.** Plan called for `.changeset/swift-kiwis-fail.md` listing three breaking changes:
   - `initPayment` request field `feeId` → `fee`
   - Client permissions `allowedFeeIds` → `allowedFeeKeys` (Secrets Manager update)
   - `transaction_amount` column dropped

   No PAY-284 changeset exists in `.changeset/`. **Blocker for merge** if your release tooling depends on changesets (looks like it does — there are 10+ existing entries).

2. **Migration timestamp**. The new migration is dated `20260515000001`. The previous migration is `20260424164039`. ~3-week gap — fine, but make sure `migrationHandler verify` step in CI is exercised against the new version number before promoting.

3. **DAWSON / NONATTORNEY consumers**. The plan correctly identifies that DAWSON keeps sending `PETITION_FILING_FEE` (the key). Confirm the JSON body schema change (`feeId` → `fee`) has been communicated to both client teams. The PR description should explicitly cite the comms thread/ticket.

4. **Rollback story.** The `down` migration is sound (re-creates `transaction_amount` and backfills from the current fee join). But: **if you deploy a new fee version between the up migration and a hypothetical rollback, the backfill will store the *new* amount on transactions that were actually charged the old amount.** Worth thinking through whether this is acceptable; arguably yes, because rollback before a fee version change has settled is the common case. Either way, mention it in the PR description so it's a deliberate accepted risk.

---

## Style / minor

- The plan correctly notes the OpenAPI schema name changes from `#/components/schemas/FeeId` to `#/components/schemas/FeeKey`. Confirm `docs/openapi.json` and `docs/openapi.yaml` have been regenerated and committed.
- `permissionsClient.ts` uses `delete perm.allowedFeeIds` after copying — fine, but if performance ever matters (it won't, n is small) you could just leave it. Cosmetic.
- `getActiveFeeByKey` calls `new Date().toISOString()` in the WHERE clause. Defensible (timezone-explicit), but `knex.fn.now()` would let Postgres evaluate it, which is more honest. The difference matters only if the app clock drifts from the DB clock, which is rare. Take or leave.

---

## Recommended actions before merge

**Blockers (must):**
1. Add the `.changeset/` entry for the three breaking changes.
2. Fix the three bugs (devServer logging, NONATTORNEY mock typo, dead `feeId` param).
3. Add a test for `getActiveFeeByKey` ordering (unit at minimum, integration if cheap).

**Should:**
4. Update [PAY-284-plan.md](../PAY-284-plan.md) Secrets Manager section to reflect the backward-compat shim.
5. Add migration-test assertions for `fee_key`, `activation_date`, and absence of `transaction_amount`.
6. Delete dead [src/fees.ts](../src/fees.ts).
7. Open a follow-up ticket to remove the `allowedFeeIds` coercion once all envs are migrated.
8. Decide deliberately on the initPayment authorize-vs-lookup ordering; document in the PR description.

**Could:**
9. Add a `transactionAmount?: number` declaration to `TransactionModel` with a JSDoc explaining it's join-only.
10. Add the FK assertion (`expect(createReceived).toHaveBeenCalledWith(expect.objectContaining({ feeId: ... }))`) to both happy-path initPayment tests.

Approve once 1–3 land. 4–8 within this PR ideally; deferrable if time-boxed.
