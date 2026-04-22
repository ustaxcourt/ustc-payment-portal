---
"@ustaxcourt/payment-portal": patch
---

### `GET /details/{transactionReferenceId}` — request validation, lookup, and response shape

The endpoint now matches its OpenAPI contract: keyed on `transactionReferenceId` (UUIDv4) instead of `payGovTrackingId`, with the published `{paymentStatus, transactions[]}` response shape.

#### Behavior changes

- **Path parameter is now `transactionReferenceId`** (UUIDv4). Previously the handler read `payGovTrackingId`.
- **Lookup uses `TransactionModel.findByReferenceId`** — a new finder that returns all rows for a given `transactionReferenceId`. Today the array will always have 0 or 1 rows due to the existing `(client_name, transaction_reference_id)` unique constraint, but the use case is written to handle N rows so no API change is needed when the constraint is later relaxed for multi-attempt support.
- **Response shape now matches `GetDetailsResponseSchema`** — `{paymentStatus, transactions: TransactionRecordSummary[]}` instead of the previous flat `{trackingId, transactionStatus}`.
- **Pay.gov SOAP refresh is conditional** — the use case only calls Pay.gov for attempts that have a `paygovTrackingId` AND are in a non-terminal status (`processed`/`failed` are skipped). Previously the call was unconditional.
- **Fee lookup is per-request, not per-attempt** — per Fee-invariance (all attempts under a `transactionReferenceId` share the same `feeId`), `FeesModel.getFeeById` is called once using `rows[0].feeId`.

#### Errors / HTTP Status Codes

| Case | Status | Error class | Message |
| --- | --- | --- | --- |
| Path param missing or not a UUID | 400 | `InvalidRequestError` | `"Transaction Reference Id was invalid"` |
| `transactionReferenceId` valid but no transaction exists | 404 | `NotFoundError` | `"Transaction Reference Id was not found"` |
| `transactionReferenceId` exists but belongs to a different client | 403 | `ForbiddenError` | `"You are not authorized to get details for this transaction."` |

All three error classes already exist with the right `statusCode` and are routed by `handleError`. No `handleError` changes needed.

#### Schema additions

- `GetDetailsPathParamsSchema` added to `src/schemas/GetDetails.schema.ts` — `z.object({ transactionReferenceId: z.uuidv4() }).strict()`.
- Registered in `src/openapi/registry.ts`.

#### API / Shared Schema

- OpenAPI `/details/{transactionReferenceId}` path now references `GetDetailsPathParamsSchema` for the path param (was an inline `z.string()`), gains a `404` response, and updates the `400`/`403` descriptions to reflect the new validation/auth semantics.
- Regenerated `docs/openapi.json` and `docs/openapi.yaml`.

#### Data

- `db/seeds/data/transactions.ts` now generates `transaction_reference_id` as UUIDv4 (via `faker.string.uuid()`) instead of the legacy `TXN-REF-XXXXXXXXX` format. Required so locally seeded rows are queryable through the validated endpoint.

#### Testing

- `src/db/TransactionModel.test.ts` — new tests for `findByReferenceId` (empty result, single match).
- `src/useCases/getDetails.test.ts` — rewritten for the new contract. Covers `NotFoundError` (no rows), `ForbiddenError` (cross-client), terminal-status case (no SOAP call), non-terminal without `paygovTrackingId` (no SOAP call), and non-terminal with `paygovTrackingId` (SOAP refresh).
- `src/lambdaHandler.test.ts` — `getDetailsHandler` tests updated for the new response shape and new path param. New tests for 400 (invalid UUID, missing/undefined params), 404 (`NotFoundError` propagation), 403 (`ForbiddenError` propagation).
- `src/test/integration/getDetails.test.ts` — new integration test covering 400 on invalid UUID and 404 on not-found, mirroring the `processPayment` integration pattern.

#### Misc

- `src/devServer.ts` — local dev route updated from `/details/:payGovTrackingId` to `/details/:transactionReferenceId` to match the deployed contract.

## Out of Scope / Follow-up

- Multi-attempt enablement: relaxing the `(client_name, transaction_reference_id)` unique constraint and updating `initPayment` to accept retries with the same reference ID.
- Fee-invariance enforcement: today this is a convention (clients pass `feeId` per `initPayment` call). Either an `initPayment` guard or a DB constraint would make it load-bearing.
