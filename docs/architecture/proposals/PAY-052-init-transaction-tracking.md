# PAY-052: Initialize Transaction — Track In DB
**Needs human review finished before we start**
**Delete before merging into main**
## Overview

On a valid `/init` request, the portal must:
1. Generate an agency tracking ID (1–21 chars, Pay.gov spec)
2. Write a `Received` transaction row to the DB before calling Pay.gov
3. After Pay.gov responds, update the row to `Initiated` with the Pay.gov token

**Prerequisite dependency:** A concurrent story is finishing the Joi → Zod migration for request validation in `lambdaHandler`. The steps below note where that boundary applies — our code should be written Zod-first but the handler wiring may need to wait.

---

## Section 1 — `fees` table migration

**Why first:** `initPayment` needs to look up `feeName`, `feeAmount`, and `tcsAppId` from the DB instead of the hardcoded `feeToTcsAppId` map in `src/useCases/initPayment.ts`. The table schema is already fully specified in `docs/architecture/API-Documentation/supported_court_fees_and_client_auth.md`.

**Tasks:**
- [ ] Create `db/migrations/<timestamp>_create_fees_table.ts` with `up`/`down` matching the architecture doc schema (`fee_id`, `name`, `tcs_app_id`, `is_variable`, `amount`, `description`, timestamps)
- [ ] Seed initial rows in `db/seeds/` (or as part of the migration) for `PETITION_FILING_FEE` and `NONATTORNEY_EXAM_REGISTRATION_FEE` with their known `tcs_app_id` values from the hardcoded map

---

## Section 2 — Make `payment_method` nullable in `transactions`

**Why:** The `transactions.payment_method` column is currently `NOT NULL`, but payment method is unknown at the `Received` and `Initiated` stages — it only becomes known after Pay.gov processes the payment. `TransactionModel` also marks it as required.

**Tasks:**
- [ ] Create `db/migrations/<timestamp>_nullable_payment_method.ts` to `ALTER TABLE transactions ALTER COLUMN payment_method DROP NOT NULL`
- [ ] Update `TransactionModel`: change `paymentMethod!: PaymentMethod` → `paymentMethod?: PaymentMethod | null`

---

## Section 3 — `agencyTrackingId` generator utility

**Why:** Pay.gov requires `agency_tracking_id` to be 1–21 characters. The portal generates it (clients do not provide it). The DB column is already sized at 21 chars.

**Tasks:**
- [ ] Create `src/utils/generateAgencyTrackingId.ts` that produces a unique, URL-safe string ≤ 21 chars (e.g., first 21 hex chars of a `crypto.randomUUID()` with hyphens stripped: `uuid().replace(/-/g, '').slice(0, 21)`)
- [ ] Add a unit test covering: output length 1–21 chars, output is alphanumeric, two calls produce different values

---

## Section 4 — `fees` DB query function

**Why:** Replaces the hardcoded `feeToTcsAppId` map. Returns structured fee data needed both for the Pay.gov request and for populating the transaction row.

**Tasks:**
- [ ] Create `src/db/FeesRepository.ts` with a `getFeeById(feeId: string)` function that queries the `fees` table and returns `{ feeName, feeAmount, tcsAppId, isVariable }` (using `knexSnakeCaseMappers` already configured in `src/db/knex.ts`)
- [ ] Return `null` when the fee is not found (caller throws `InvalidRequestError`)
- [ ] Add unit tests for found / not-found cases

---

## Section 5 — `TransactionModel` write methods

**Why:** `TransactionModel` currently only has read methods. We need to insert on `Received` and update on `Initiated`.

**Tasks:**
- [ ] Add `static async createReceived(data: {...}): Promise<TransactionModel>` — inserts a row with `transactionStatus: 'received'`, `paymentStatus: 'pending'`, all required fields, no token
- [ ] Add `static async updateToInitiated(agencyTrackingId: string, paygovToken: string): Promise<void>` — patches `transaction_status = 'initiated'`, `paygov_token`, and `last_updated_at = NOW()`
- [ ] Add unit tests for both methods

---

## Section 6 — Thread `clientName` from `authorizeClient` into `initPayment`

**Why:** The transaction row needs `clientName` (the human-readable name from Secrets Manager, e.g. `"DAWSON"`). `authorizeClient` already fetches the `ClientPermission` object containing it but currently returns `void`. `initPayment` has no way to know which client called it.

**Tasks:**
- [ ] Change `authorizeClient` return type from `Promise<void>` to `Promise<ClientPermission>` — return the resolved client (it already throws for unauthorized, so a successful return always has a valid client)
- [ ] Update `lambdaHandler` to capture the returned `ClientPermission` and inject `clientName` into the request object before the `callback(appContext, request)` call — specifically for the `initPayment` path
- [ ] Update all callers and tests of `authorizeClient`

---

## Section 7 — Update `InitPaymentRequest` type

**Why:** The old type in `src/types/InitPaymentRequest.ts` uses `trackingId` and `amount` — fields from the old Joi-based contract. The Zod schema in `src/schemas/InitPayment.schema.ts` is the canonical shape and uses `transactionReferenceId` and `metadata`. The use case also needs `clientName` (from Section 6).

> **Note:** Full request validation via Zod in `lambdaHandler` is gated on the concurrent Joi removal story. This section updates only the internal type so `initPayment` uses the correct field names. The handler's manual `feeId` check stays in place until that story lands.

**Tasks:**
- [ ] Update `src/types/InitPaymentRequest.ts` to match the Zod schema shape: `transactionReferenceId`, `feeId`, `urlSuccess`, `urlCancel`, `metadata`, and add `clientName: string`
- [ ] Remove the old `trackingId` and `amount` fields (amount is now resolved from the fees table; `trackingId` is generated internally)

---

## Section 8 — Refactor `initPayment` use case end-to-end

**Why:** This is the main wiring step that connects all prior sections into the full acceptance-criteria flow.

**Tasks:**
- [ ] Remove the hardcoded `feeToTcsAppId` map
- [ ] Replace it with a `getFeeById` call (Section 4); throw `InvalidRequestError('Fee type is not available')` if null
- [ ] Call `generateAgencyTrackingId()` (Section 3)
- [ ] Call `TransactionModel.createReceived(...)` (Section 5) with:
  - `agencyTrackingId` (generated)
  - `feeName`, `feeId`, `feeAmount` (from fee lookup)
  - `clientName` (from request, injected in Section 6)
  - `transactionReferenceId` (from request)
  - `transactionStatus: 'received'`
  - `createdAt` / `lastUpdatedAt` (DB default, or explicit `new Date().toISOString()`)
- [ ] Call Pay.gov SOAP (existing `StartOnlineCollectionRequest` — update to use `agencyTrackingId` and fee-resolved `tcsAppId` and `amount`)
- [ ] Call `TransactionModel.updateToInitiated(agencyTrackingId, result.token)` (Section 5)
- [ ] Return `{ token, paymentRedirect }` as before

---

## Section 9 — Update tests
**Blocked: Before updating tests we need to investigate adding RDS access to emphemeral PR environments (or creating test tables inside of the Dev RDS instance and given them access to that), otherwise any DB actions in integration tests will always fail**
**Tasks:**
- [ ] Update `src/useCases/initPayment.test.ts` unit tests to reflect the new request shape (`transactionReferenceId`, `metadata`, `clientName`) and mock `getFeeById` + `TransactionModel` write methods
- [ ] Add an integration test in `src/test/integration/initPayment.test.ts` that:
  - Hits the handler end-to-end with a mocked Pay.gov SOAP response
  - Asserts the DB row exists with `transactionStatus = 'received'` before the Pay.gov call and `transactionStatus = 'initiated'` with a token after
- [ ] Verify existing tests for `authorizeClient`, `lambdaHandler`, and `processPayment` still pass after the `authorizeClient` return-type change (Section 6)

---

## Sequencing summary

```
Section 1 (fees migration)
Section 2 (nullable payment_method)
     |
     +-- Section 3 (agencyTrackingId util)   ← independent, can run in parallel
     |
Section 4 (FeesRepository)          ← depends on Section 1
Section 5 (TransactionModel writes) ← depends on Section 2
     |
Section 6 (thread clientName)
Section 7 (update request type)
     |
Section 8 (refactor initPayment)    ← depends on 3, 4, 5, 6, 7
     |
Section 9 (tests)
```
