# getDetails: validate request — implementation plan

**Status:** Ready to start (D1, D2, D4 confirmed; D3, D5, D6 still proposed)
**Companion doc:** [getDetails-validate-request.md](./getDetails-validate-request.md) — decisions and rationale

---

## Approach

**Single PR.** This PR brings `getDetails` in line with its OpenAPI contract and adds request validation in one cohesive change. The work clusters around `getDetails`, doesn't touch unrelated code, and avoids shipping a transient state where the response shape is correct but validation is missing.

The PR effectively does three things:

1. **Rename + relookup:** path param becomes `transactionReferenceId`; DB lookup keys on it instead of `payGovTrackingId`.
2. **Response shape alignment:** return `{paymentStatus, transactions: [...]}` per `GetDetailsResponseSchema` instead of the current flat `{trackingId, transactionStatus}`.
3. **Validation + authorization:** UUID validation, 404 not-found, 403 cross-client.

Error routing leans on the existing `handleError` infrastructure — the right error class produces the right status code automatically. No `handleError` changes needed.

---

## Error contract (per D4)

| Case | Status | Error class | Message |
| --- | --- | --- | --- |
| Path param missing or not a UUID | 400 | `InvalidRequestError` | `"Transaction Reference Id was invalid"` |
| `transactionReferenceId` valid but no transaction exists for it | 404 | `NotFoundError` | `"Transaction Reference Id was not found"` |
| `transactionReferenceId` exists but belongs to a different client | 403 | `ForbiddenError` | `"You are not authorized to get details for this transaction."` |

All three classes already exist with the right `statusCode` field and are routed by [handleError.ts:6-13](../../../src/handleError.ts#L6-L13). No new error infrastructure required.

---

## Files to touch

### Source

| File | Change |
| --- | --- |
| [src/schemas/GetDetails.schema.ts](../../../src/schemas/GetDetails.schema.ts) | Add `GetDetailsPathParamsSchema = z.object({ transactionReferenceId: z.uuidv4() }).strict()`. Mirror the pattern used in `ProcessPaymentRequestSchema`. |
| [src/db/TransactionModel.ts](../../../src/db/TransactionModel.ts) | Add a finder that supports the 403-vs-404 distinction. Two equivalent options (pick during implementation): **(a)** two methods — `findByClientAndReferenceId(clientName, refId)` plus `findByReferenceId(refId)`; or **(b)** a single `findByReferenceId(refId)` and let the use case filter by clientName. |
| [src/lambdaHandler.ts](../../../src/lambdaHandler.ts) | Read `transactionReferenceId` from `pathParameters`, validate via `GetDetailsPathParamsSchema`, throw `InvalidRequestError` with a meaningful message on failure. Pass the validated value + client to the use case. |
| [src/useCases/getDetails.ts](../../../src/useCases/getDetails.ts) | Rewrite. Look up by `transactionReferenceId`. Throw `NotFoundError` if no rows exist anywhere; `ForbiddenError` if rows exist but none match `clientName`. Derive `tcsAppId` from `rows[0].feeId` (Fee invariance per PO). Call Pay.gov SOAP only for rows with a `paygovTrackingId` and non-terminal status. Derive top-level `paymentStatus` via `derivePaymentStatus`. Map each row to a `TransactionRecordSummary`. |
| [src/openapi/registry.ts](../../../src/openapi/registry.ts) | Register the path-params schema. Add 400, 403, 404 response entries for `/details/{transactionReferenceId}`. |

### Tests

| File | Change |
| --- | --- |
| [src/db/TransactionModel.test.ts](../../../src/db/TransactionModel.test.ts) | Tests for the new finder(s): empty result, single row, multi-client isolation. |
| [src/useCases/getDetails.test.ts](../../../src/useCases/getDetails.test.ts) | Rewrite all tests for the new contract. Cover: empty result → `NotFoundError`; cross-client → `ForbiddenError`; happy path single row; row without `paygovTrackingId` (no SOAP call); SOAP failure handling. |
| [src/lambdaHandler.test.ts](../../../src/lambdaHandler.test.ts) | New handler-level tests: 400 (missing param), 400 (non-UUID), 404 (not found), 403 (cross-client), 200 (happy path with new response shape). |
| [src/test/integration/getDetails.test.ts](../../../src/test/integration/) (new) | Mirror [processPayment.test.ts](../../../src/test/integration/processPayment.test.ts): 400 on missing/invalid param, smoke test that valid UUID reaches Lambda. |

### Data and docs

| File | Change |
| --- | --- |
| [db/seeds/data/transactions.ts](../../../db/seeds/data/transactions.ts) | Replace `TXN-REF-XXXXXXXXX` format with `crypto.randomUUID()`. Otherwise locally seeded data won't be queryable through the validated endpoint. |
| [docs/openapi.yaml](../../openapi.yaml), [docs/openapi.json](../../openapi.json) | Regenerate via `src/openapi/generate.ts`. Path param example becomes a UUID; 404 and 403 response entries added. |
| `.changeset/*.md` | New changeset entry. |

---

## Acceptance criteria mapping

| AC | How it's satisfied |
| --- | --- |
| 400 when `transactionReferenceId` is invalid | Zod `z.uuidv4()` validation in the handler, `InvalidRequestError("Transaction Reference Id was invalid")` thrown on failure |
| 400 when `transactionReferenceId` does not exist | **Diverging per D4: returns 404** (`NotFoundError("Transaction Reference Id was not found")`). REST-conventional. |
| 403 when belongs to a different client | `ForbiddenError("You are not authorized to get details for this transaction.")` thrown from use case after detecting `clientName` mismatch |

---

## Implementation order

1. Add `GetDetailsPathParamsSchema` and write the schema test
2. Add the new finder method(s) on `TransactionModel` with tests
3. Rewrite `getDetails` use case + tests
4. Update `lambdaHandler.getDetailsHandler` + tests
5. Update OpenAPI registry, regenerate spec
6. Update seed data
7. Add integration test
8. Add changeset

---

## Out of scope (follow-up tickets)

- Pay.gov status refresh for *every* pending attempt on a `getDetails` call
- Multi-attempt enablement: removing/relaxing the `(client_name, transaction_reference_id)` unique constraint and updating `initPayment` to allow retries with the same reference ID
- Fee-invariance enforcement: today, "all attempts share the same Fee" is a convention, not a constraint

---

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Existing client depends on the current flat response shape (`{trackingId, transactionStatus}`) | Unknown | Audit consumers before merging; coordinate with anyone who's calling `/details/...` today |
| Seed data update breaks dashboard or other tests that hard-code `TXN-REF-*` strings | Low–Medium | Grep for `TXN-REF` before merging — there are at least three doc/spec hits to update |
| Fee-invariance assumption breaks if data drift exists | Low (unique constraint prevents this today) | Add a defensive assertion in the use case that all rows share a `feeId`; log a server error if violated |
| 403-vs-404 logic mistakenly returns 403 when no transaction exists at all | Low | Tests explicitly cover both branches: "no row anywhere" → 404, "row exists but wrong client" → 403 |

---

## Pre-flight checklist

- [ ] Audit `/details/...` consumers for the response shape change
- [ ] Confirm we're keeping D3 (authorize by `clientName`) and D5 (skip Pay.gov SOAP when no `paygovTrackingId`) — these haven't been explicitly confirmed by PO but follow naturally from D1/D2
