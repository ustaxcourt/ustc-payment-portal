# Implementation Plan: GetDetails Failure Handling (PAY-306)

A principal-grade, surgical fix. Three real changes, two new test files, one changeset. Explicit trade-offs called out where they exist.

## Design decisions (the why)

1. **Reuse the `c09689e` (PAY-305) pattern verbatim.** That PR established the project's idiom for Pay.gov failure handling: `try/catch` around the SOAP call, call `updateToFailed(...).catch(log)` to mark the row, then throw `PayGovError` with a retry-encouraging message. We mirror it exactly so the codebase stays consistent.
2. **Make `PayGovError.statusCode` configurable, default `504`.** The AC says "throw 500." Today `PayGovError` is hardcoded to 504. Hardcoding 500 globally would silently change `initPayment`'s contract. We add an optional constructor parameter (default 504, no behavior change for `initPayment`), and pass `500` from the new `getDetails` call sites. **This is acknowledged design debt — see [Acknowledged debt](#acknowledged-debt-flag-in-pr-not-fix-here) below.**
3. **Add the missing Pay.gov-response Zod schema.** The ticket presumes a ZodError can be thrown. Today `GetDetailsRequest.useHttp` does duck-typing — no Zod, no error. The fix requires the schema to exist; without it the AC is unsatisfiable. This is a prerequisite, not scope creep.
4. **Keep `Promise.all`, change the per-row contract.** Current code swallows errors and returns stale data. New code: any row's refresh failure → mark *that* row failed → throw. `Promise.all` rejects on first failure; concurrent in-flight writes for sibling rows are idempotent. **The partial-success-then-throw case is intentional and pinned by a test** — see [Multi-row partial-write contract](#multi-row-partial-write-contract).
5. **Don't touch `handleError.ts`.** `PayGovError` already routes correctly through `err instanceof PayGovError → err.statusCode`. ZodError-from-request-body still needs 400 (used by `parseRequestBody`), so we keep the existing branch order. The Pay.gov-response ZodError is converted at the use-case boundary before `handleError` ever sees it.
6. **Don't use a numeric sentinel return code.** PAY-305 used `EXISTING_TOKEN_ERROR_CODE = 5009` in the Pay.gov-namespaced `returnCode` column. Extending that precedent would compound the namespace pollution. Instead: pass `undefined` for `returnCode` and a descriptive `returnDetail` string. This keeps `returnCode` semantically "Pay.gov said this" and `returnDetail` as "what actually happened." A follow-up ticket should migrate the existing `5009` to the same convention.

## File-by-file changes

### 1. `src/errors/payGovError.ts` — make statusCode injectable

```ts
export class PayGovError extends Error {
  public statusCode: number;

  // Default 504 preserves PAY-305's initPayment contract.
  // PAY-306 passes 500 for response-level failures (malformed payload, DB persist
  // failure) where Pay.gov was reachable but the round-trip is unrecoverable for the client.
  constructor(message: string = "Error communicating with Pay.gov", statusCode: number = 504) {
    super(message);
    this.statusCode = statusCode;
  }
}
```

### 2. `src/schemas/PayGovGetDetailsResponse.schema.ts` — new file

**Naming note:** `GetDetails.schema.ts` already exists for the *outbound* API response. This new file is the *inbound Pay.gov SOAP response* schema — named to avoid collision and to match the sibling `CompleteOnlineCollectionWithDetailsResponse.schema.ts` pattern.

```ts
import { z } from "zod";
import { PayGovTransactionStatusSchema } from "./CompleteOnlineCollectionWithDetailsResponse.schema";

export const PayGovGetDetailsTransactionSchema = z.object({
  paygov_tracking_id: z.string(),
  agency_tracking_id: z.string(),
  // fast-xml-parser coerces numeric leaf values to numbers by default
  // (xmlOptions.ts overrides only ignoreAttributes / format / trimValues).
  transaction_amount: z.number(),
  transaction_status: PayGovTransactionStatusSchema,
  payment_type: z.string().optional(),
  transaction_date: z.iso.datetime({ local: true, offset: true }).optional(),
  payment_date: z.iso.date().optional(),
});

const TransactionWrapperSchema = z.object({
  transaction: PayGovGetDetailsTransactionSchema,
});

export const PayGovGetDetailsResponseSchema = z.object({
  transactions: z.union([
    TransactionWrapperSchema,
    z.array(TransactionWrapperSchema).nonempty(),
  ]),
});

export type PayGovGetDetailsTransaction = z.infer<typeof PayGovGetDetailsTransactionSchema>;
export type PayGovGetDetailsResponseBody = z.infer<typeof PayGovGetDetailsResponseSchema>;
```

> `nonempty()` on the array branch preserves the existing "Could not find any transaction details" check — an empty array now fails schema validation and becomes a `ZodError` (and downstream a `PayGovError`) instead of a bare `Error`.

### 3. `src/entities/GetDetailsRequest.ts` — validate response, fix type, drop bare Error

Two changes:

**(a)** Update `TransactionDetails.transaction_amount` from `string` to `number` to match what the XML parser actually produces and what the schema validates. Verified via the existing test `result.transaction_amount).toBe(150)` in `GetDetailsRequest.test.ts:54`.

```ts
export type TransactionDetails = {
  paygov_tracking_id: string;
  transaction_status: PayGovTransactionStatus;
  agency_tracking_id: string;
  transaction_amount: number; // was: string — XML parser coerces, sibling schemas already number-typed
  payment_type?: string;
  transaction_date?: string;
  payment_date?: string;
};
```

**(b)** Replace `useHttp` body:

```ts
useHttp = async (appContext: AppContext): Promise<TransactionDetails> => {
  const params: GetRequestRequestParams = {
    tcs_app_id: this.tcsAppId,
    paygov_tracking_id: this.payGovTrackingId,
  };

  const responseBody = await SoapRequest.prototype.makeRequest(
    appContext,
    params,
    this.requestType,
  );

  const raw = responseBody["ns2:getDetailsResponse"]?.getDetailsResponse;
  const parsed = PayGovGetDetailsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Logging the raw response so on-call can diagnose Pay.gov contract drift.
    // Pay.gov's getDetails response does not contain PCI data — payment_type is a
    // string like "ACH"/"PLASTIC_CARD" and tracking IDs are server-side identifiers,
    // not cardholder data. If that ever changes, redact before logging.
    console.error(
      "getDetails schema validation failed",
      JSON.stringify({ raw, errors: parsed.error.issues }),
    );
    throw parsed.error;
  }

  const wrapper = Array.isArray(parsed.data.transactions)
    ? parsed.data.transactions[0]
    : parsed.data.transactions;
  return wrapper.transaction;
};
```

Imports add: `import { PayGovGetDetailsResponseSchema } from "../schemas/PayGovGetDetailsResponse.schema";`

> The `as TransactionDetails` cast from v1 of this plan is gone — once `TransactionDetails.transaction_amount` is `number`, the `wrapper.transaction` value matches the type directly.

### 4. `src/useCases/getDetails.ts` — stop swallowing, start failing

Replace the two `catch (err)` blocks at lines 106-112 and 128-136:

```ts
const PAYGOV_RETRY_MESSAGE =
  "There was an error communicating with Pay.gov. Please retry your transaction.";

// ...inside updatePendingAttemptFromPayGov, replace the body of the Promise.all map...
const transactions: TransactionRecordSummary[] = await Promise.all(
  allRows.map(async (row) => {
    if (!row.paygovTrackingId || isTerminal(row.transactionStatus)) {
      return toTransactionRecordSummary(row);
    }

    const req = new GetRequestRequest({
      tcsAppId,
      payGovTrackingId: row.paygovTrackingId,
    });

    let result;
    let refreshedStatus;
    try {
      result = await req.makeSoapRequest(appContext);
      refreshedStatus = parseTransactionStatus(result.transaction_status);
    } catch (err) {
      console.error(
        `Failed to refresh status for paygovTrackingId '${row.paygovTrackingId}':`,
        err,
      );
      // returnCode is intentionally undefined — that column holds Pay.gov return codes;
      // this failure is internal (network, schema, parse), not a Pay.gov-issued code.
      await TransactionModel.updateToFailed(
        row.agencyTrackingId,
        undefined,
        "Pay.gov refresh failed",
      ).catch((dbErr) =>
        console.error("Failed to mark transaction as failed", dbErr),
      );
      throw new PayGovError(PAYGOV_RETRY_MESSAGE, 500);
    }

    try {
      const updated = await TransactionModel.updateAfterPayGovResponse(
        row.agencyTrackingId,
        result.paygov_tracking_id,
        refreshedStatus,
        derivePaymentStatusFromSingleTransaction(refreshedStatus),
        (result.payment_type ? toPaymentMethod(result.payment_type) : null) ??
          row.paymentMethod ??
          null,
        result.transaction_date,
        result.payment_date,
      );
      return toTransactionRecordSummary(updated);
    } catch (err) {
      console.error(
        `Failed to persist refreshed status for paygovTrackingId '${row.paygovTrackingId}':`,
        err,
      );
      await TransactionModel.updateToFailed(
        row.agencyTrackingId,
        undefined,
        "Failed to persist Pay.gov refresh",
      ).catch((dbErr) =>
        console.error("Failed to mark transaction as failed", dbErr),
      );
      throw new PayGovError(PAYGOV_RETRY_MESSAGE, 500);
    }
  }),
);
```

Imports add: `import { PayGovError } from "../errors/payGovError";`

> Two catches throw the same `PayGovError` but for different root causes. Keeping them separate (rather than wrapping the whole iteration in one try) preserves the precise `console.error` distinction between "refresh failed" and "persist failed" — that's the diagnostic value the original code had, and we keep it.

### Multi-row partial-write contract

When `findByReferenceId` returns multiple pending rows, `Promise.all` runs their refreshes concurrently. If row A succeeds and row B fails:

1. Row A's `updateAfterPayGovResponse` may already have committed.
2. Row B's catch fires → marks row B failed → throws `PayGovError`.
3. Row A's promise resolution is discarded by `Promise.all` (already rejected).
4. Client sees 500.
5. Client retries → next `getDetails` call sees row A as terminal (skipped) and row B as failed (skipped) → returns the correct group state.

**This is intentional.** The alternative — `Promise.allSettled` — re-introduces exactly the "log and continue" behavior the ticket exists to eliminate. The 500 is honest about partial success because the *call* didn't succeed; the next call will reflect the persisted state. A test pins this:

```ts
it("returns 500 even when one row persisted successfully and a sibling failed", async () => {
  // covered in getDetails.test.ts test plan below
});
```

## Caller audit

`grep -rn "getDetails\\|GetDetails"` for production callers of the `getDetails` use case:

| Caller | Effect of the change |
| --- | --- |
| `lambdaHandler.ts` | Already routes thrown errors through `handleError`. No change. |
| `test/integration/transaction.test.ts` | Calls `getDetails` via HTTP, polls. Existing happy-path tests unaffected. |
| `useCases/getDetails.test.ts` | Unit tests — rewritten below. |

No other production code imports the use case. Safe.

## OpenAPI / API contract

[src/openapi/registry.ts](src/openapi/registry.ts#L139-L147) already documents both 500 and 504 responses for `getDetails`. The semantic shift (some failures that previously returned 200-with-stale-data now return 500) is a behavior change but not a schema change. No registry update required.

## Test plan — 100% branch coverage

### `src/errors/payGovError.test.ts` — extend

```ts
it("defaults to statusCode 504 when none provided (back-compat)", () => {
  expect(new PayGovError().statusCode).toBe(504);
  expect(new PayGovError("msg").statusCode).toBe(504);
});

it("accepts a custom statusCode", () => {
  const err = new PayGovError("retry", 500);
  expect(err.statusCode).toBe(500);
  expect(err.message).toBe("retry");
});
```

### `src/schemas/PayGovGetDetailsResponse.schema.test.ts` — new file

Following the same pattern as `CompleteOnlineCollectionWithDetailsResponse.schema.test.ts`:

```ts
import { PayGovGetDetailsResponseSchema } from "./PayGovGetDetailsResponse.schema";

describe("PayGovGetDetailsResponseSchema", () => {
  const validTransaction = {
    paygov_tracking_id: "TRK1234567890123456AB",
    agency_tracking_id: "agency-1",
    transaction_amount: 60,
    transaction_status: "Success",
  };

  it("accepts a single transaction wrapper", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: validTransaction },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an array of transaction wrappers", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: [{ transaction: validTransaction }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty transactions array", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({ transactions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a string transaction_amount (catches XML-parser misconfiguration)", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: { ...validTransaction, transaction_amount: "60.00" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized transaction_status", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: { ...validTransaction, transaction_status: "Unknown" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when required fields are missing", () => {
    const { paygov_tracking_id: _omit, ...rest } = validTransaction;
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: rest },
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional payment_type, transaction_date, payment_date", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: {
          ...validTransaction,
          payment_type: "ACH",
          transaction_date: "2026-01-15T10:30:00",
          payment_date: "2026-01-16",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed transaction_date", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: { ...validTransaction, transaction_date: "not-a-date" },
      },
    });
    expect(result.success).toBe(false);
  });
});
```

### `src/entities/GetDetailsRequest.test.ts` — update

Replace the "throws error when no transaction details found" test with the schema-aware version, and add the ZodError cases:

```ts
import { ZodError } from "zod";

afterEach(() => {
  // Earlier tests in this file overwrite SoapRequest.prototype.makeRequest; restore each time.
  jest.restoreAllMocks();
});

it("throws a ZodError when Pay.gov returns an empty transactions array", async () => {
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
    "ns2:getDetailsResponse": { getDetailsResponse: { transactions: [] } },
  });
  const request = new GetRequestRequest({ tcsAppId: "x", payGovTrackingId: "y" });
  await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(ZodError);
});

it("throws a ZodError when Pay.gov returns a response missing required fields", async () => {
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
    "ns2:getDetailsResponse": {
      getDetailsResponse: {
        transactions: { transaction: { paygov_tracking_id: "x" } },
      },
    },
  });
  const request = new GetRequestRequest({ tcsAppId: "x", payGovTrackingId: "y" });
  await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(ZodError);
});

it("throws a ZodError when Pay.gov returns an unrecognized transaction_status", async () => {
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
    "ns2:getDetailsResponse": {
      getDetailsResponse: {
        transactions: {
          transaction: {
            paygov_tracking_id: "x",
            agency_tracking_id: "a",
            transaction_amount: 1,
            transaction_status: "Bogus",
          },
        },
      },
    },
  });
  const request = new GetRequestRequest({ tcsAppId: "x", payGovTrackingId: "y" });
  await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(ZodError);
});
```

> Switched from raw `SoapRequest.prototype.makeRequest = jest.fn()` reassignment (the pre-existing style) to `jest.spyOn(...).mockResolvedValue(...)` with `restoreAllMocks` in `afterEach`. The old style leaks across tests if a test throws before restoring; `spyOn` plus `restoreAllMocks` is the standard Jest idiom and matches `getDetails.test.ts`'s use of spies. Drive-by cleanup; safe because the existing tests don't depend on the raw-reassign mechanic.

### `src/useCases/getDetails.test.ts` — rewrite failure tests

**Update the `jest.mock` block at lines 9-15** to include `updateToFailed`:

```ts
jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByReferenceId: jest.fn(),
    updateAfterPayGovResponse: jest.fn(),
    updateToFailed: jest.fn(),
  },
}));
```

Add `beforeEach`: `TransactionModelMock.updateToFailed.mockResolvedValue(undefined as never);`

**Import `PayGovError`** at the top.

**Replace** "logs and continues when the Pay.gov SOAP refresh fails for an attempt" (lines 292-310) with three tests:

```ts
it("marks the row as failed and throws PayGovError(500) when Pay.gov SOAP refresh fails", async () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
  appContext.postHttpRequest = jest.fn().mockRejectedValue(new Error("Pay.gov network failure"));

  await expect(
    getDetails(appContext, { client: mockClient, request: { transactionReferenceId: mockTransactionReferenceId } }),
  ).rejects.toMatchObject({
    statusCode: 500,
    message: "There was an error communicating with Pay.gov. Please retry your transaction.",
  });

  expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
    "agency-tracking-1",
    undefined,
    "Pay.gov refresh failed",
  );
  expect(TransactionModelMock.updateAfterPayGovResponse).not.toHaveBeenCalled();
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining(`Failed to refresh status for paygovTrackingId '${mockPayGovTrackingId}'`),
    expect.any(Error),
  );
  consoleErrorSpy.mockRestore();
});

it("throws PayGovError(500) when the Pay.gov response fails schema validation (ZodError)", async () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
  const malformed = mockPendingSoapResponse.replace(
    `<transaction_status>Received</transaction_status>`,
    `<transaction_status>NonsenseStatus</transaction_status>`,
  );
  appContext.postHttpRequest = jest.fn().mockResolvedValue(malformed);

  const promise = getDetails(appContext, {
    client: mockClient,
    request: { transactionReferenceId: mockTransactionReferenceId },
  });

  await expect(promise).rejects.toBeInstanceOf(PayGovError);
  await expect(promise).rejects.toMatchObject({ statusCode: 500 });
  expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
    "agency-tracking-1",
    undefined,
    "Pay.gov refresh failed",
  );
  consoleErrorSpy.mockRestore();
});

it("still throws PayGovError when updateToFailed itself rejects after a SOAP failure", async () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
  appContext.postHttpRequest = jest.fn().mockRejectedValue(new Error("SOAP boom"));
  TransactionModelMock.updateToFailed.mockRejectedValueOnce(new Error("DB also down"));

  await expect(
    getDetails(appContext, { client: mockClient, request: { transactionReferenceId: mockTransactionReferenceId } }),
  ).rejects.toBeInstanceOf(PayGovError);
  expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to mark transaction as failed", expect.any(Error));
  consoleErrorSpy.mockRestore();
});
```

**Replace** "returns the fresh Pay.gov status and logs a persist failure when the DB writeback throws" (lines 424-444) with:

```ts
it("marks the row as failed and throws PayGovError(500) when updateAfterPayGovResponse rejects", async () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
  appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);
  TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(new Error("DB connection lost"));

  await expect(
    getDetails(appContext, { client: mockClient, request: { transactionReferenceId: mockTransactionReferenceId } }),
  ).rejects.toMatchObject({
    statusCode: 500,
    message: "There was an error communicating with Pay.gov. Please retry your transaction.",
  });

  expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
    "agency-tracking-1",
    undefined,
    "Failed to persist Pay.gov refresh",
  );
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining(`Failed to persist refreshed status for paygovTrackingId '${mockPayGovTrackingId}'`),
    expect.any(Error),
  );
  consoleErrorSpy.mockRestore();
});

it("still throws PayGovError when updateToFailed itself rejects after a persist failure", async () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());
  appContext.postHttpRequest = jest.fn().mockResolvedValue(mockSuccessSoapResponse);
  TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(new Error("DB down"));
  TransactionModelMock.updateToFailed.mockRejectedValueOnce(new Error("DB even more down"));

  await expect(
    getDetails(appContext, { client: mockClient, request: { transactionReferenceId: mockTransactionReferenceId } }),
  ).rejects.toBeInstanceOf(PayGovError);
  expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to mark transaction as failed", expect.any(Error));
  consoleErrorSpy.mockRestore();
});
```

**Add a new test pinning the multi-row partial-write-then-throw contract** to the existing "multiple attempts under the same transactionReferenceId" describe block:

```ts
it("returns 500 even when one row persisted successfully before a sibling row failed", async () => {
  // Sibling rows: row A refreshes cleanly, row B's SOAP call rejects.
  // Promise.all rejects once B throws; A may have already written. Client should see 500
  // and on retry the persisted state reflects what happened.
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(jest.fn());

  TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
    buildRow({ agencyTrackingId: "row-A", paygovTrackingId: "TRK0000000000000001AB", transactionStatus: "pending", paymentStatus: "pending" }),
    buildRow({ agencyTrackingId: "row-B", paygovTrackingId: "TRK0000000000000002AB", transactionStatus: "pending", paymentStatus: "pending" }),
  ]);

  appContext.postHttpRequest = jest
    .fn()
    .mockImplementationOnce(async () => mockSuccessSoapResponse) // row A
    .mockImplementationOnce(async () => { throw new Error("Pay.gov down for row B"); }); // row B

  await expect(
    getDetails(appContext, { client: mockClient, request: { transactionReferenceId: mockTransactionReferenceId } }),
  ).rejects.toMatchObject({ statusCode: 500 });

  // Row B was marked failed even though it never persisted its refresh.
  expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith("row-B", undefined, "Pay.gov refresh failed");
  // Row A's write may or may not have landed depending on scheduling — we don't assert on it,
  // because Promise.all does not await sibling resolutions after rejection. What we DO pin
  // is that the rejection wins: client sees a 500, not a 200 with mixed results.

  consoleErrorSpy.mockRestore();
});
```

### `src/handleError.test.ts` — back-compat assertion

Add one test asserting `PayGovError` with explicit `500` routes through correctly:

```ts
it("returns the PayGovError statusCode when overridden (e.g. 500)", () => {
  const result = handleError(new PayGovError("Please retry", 500));
  expect(result.statusCode).toBe(500);
  expect(JSON.parse(result.body).message).toBe("Please retry");
});
```

### `.changeset/<random-name>.md` — new file

Run `npx changeset` or hand-author following the `thin-poets-say.md` template:

```md
---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### GetDetails Use Case
Previously, when the Pay.gov refresh inside `getDetails` failed for any of three reasons — schema validation (ZodError), SOAP/network error, or a DB write rejection — the failure was logged and stale data was returned. The transaction stayed stuck in its non-terminal state indefinitely.

The use case now mirrors the `initPayment` pattern from PAY-305:
- **SOAP/Zod/parse failure on the refresh:** mark the row as `failed` via `updateToFailed`, then throw `PayGovError(500)` encouraging a retry.
- **DB failure on `updateAfterPayGovResponse`:** mark the row as `failed`, then throw `PayGovError(500)`.
- If `updateToFailed` itself rejects, the secondary failure is logged so the original cause is not masked.
- `returnCode` is left undefined for these failures (it is Pay.gov-namespaced); the human-readable cause goes in `returnDetail`.

### GetDetailsRequest entity
- Added Zod validation of the Pay.gov response shape against `PayGovGetDetailsResponseSchema`.
- The previous bare `Error("Could not find any transaction details")` is replaced by schema rejection (empty `transactions` array fails `.nonempty()`).
- `TransactionDetails.transaction_amount` corrected from `string` to `number` to match what the XML parser actually produces.

### PayGovError
- `statusCode` is now an optional constructor argument (default `504`, preserving existing `initPayment` behavior). `getDetails` passes `500` per acceptance criteria.

### Schemas
- New `PayGovGetDetailsResponse.schema.ts` (Pay.gov inbound SOAP response — distinct from the existing outbound `GetDetails.schema.ts`).

### Testing
- `getDetails.test.ts` failure-path tests rewritten — they previously asserted the bug ("logs and continues"); they now assert the correct fail-fast contract, including the multi-row partial-write-then-throw case.
- `GetDetailsRequest.test.ts` extended with ZodError cases and migrated to `jest.spyOn` + `restoreAllMocks`.
- `payGovError.test.ts` and `handleError.test.ts` extended for the configurable statusCode.
```

## Verification checklist

| Check | How |
| --- | --- |
| All three AC failure modes mark the row failed and throw 500 | New tests in `getDetails.test.ts` |
| Retry-encouraging message reaches the client | Test asserts exact message string |
| `initPayment`'s 504 contract unchanged | `payGovError.test.ts` "defaults to 504" + `grep "PayGovError(" src/useCases/initPayment.ts` confirms no statusCode override |
| `parseRequestBody` ZodError still returns 400 | `handleError.test.ts` existing ZodError test still passes |
| Multi-row happy path unchanged | Existing "writes back every pending attempt in a multi-row group" test still passes |
| Multi-row partial-write contract pinned | New test in the multiple-attempts describe block |
| `TransactionDetails.transaction_amount` consumers happy | Type change is contravariant for consumers (number is more specific than string-or-number). `grep "transaction_amount" src/` to verify no caller relies on string semantics (string concat, `.length`, etc.) |
| Test coverage ≥ 90% | `npm test -- --coverage` — every new branch (two catches, two `updateToFailed.catch`, schema parse failure) exercised |
| Lint/type-check | `npm run lint && npm run typecheck` |
| Changeset present | `.changeset/<name>.md` exists |

## Acknowledged debt (flag in PR, not fix here)

These are real design issues that exceed the ticket's scope. Each gets a sentence in the PR description so reviewers can deliberately bless or push back.

1. **`PayGovError.statusCode` as a constructor parameter is a code smell.** The HTTP status is part of the error's identity; encoding it as runtime state means the type no longer carries the semantic. A cleaner future shape: split into `PayGovUpstreamError` (504, network/timeout — `initPayment` use case) and `PayGovResponseError` (500, malformed payload / persist failure — `getDetails` use case). Out of scope for PAY-306 because (a) the AC names `payGovError.ts` specifically and (b) refactoring the existing `initPayment` call site would re-open PAY-305. **Follow-up ticket recommended.**

2. **`returnCode` column semantics.** PAY-305 introduced `EXISTING_TOKEN_ERROR_CODE = 5009` into the Pay.gov-namespaced `returnCode` column. PAY-306 stops compounding that by leaving `returnCode` undefined for our own failures. The `5009` value is still mixed in. **Follow-up ticket recommended:** migrate `5009` to use `returnDetail` only, or introduce a separate `internalFailureReason` column.

3. **Pay.gov response logging assumption.** The new `console.error` in `GetDetailsRequest.useHttp` logs the full raw Pay.gov response on schema failure. Pay.gov's `getDetails` response is not currently believed to contain PCI data (no PAN, no CVV, no full card number). If that ever changes — or if Pay.gov adds new fields — the log line needs a redaction step. Documented in a code comment at the log site.

## Gaps explicitly considered and out-of-scope

- **Logger migration to pino.** PAY-305 explicitly removed logger usage pending an architectural decision. We stay on `console.error` for consistency. Will be addressed when the logger decision lands.
- **Integration test for the new failure paths.** Integration tests hit real (or fake-but-real-shaped) Pay.gov via HTTP and have no mechanism to inject a malformed response on demand. Adding one would require new test infrastructure (a controllable Pay.gov stub mode). Out of scope; unit coverage at the use-case and entity boundaries is sufficient for this ticket because the new code paths are pure error handling with no I/O Jest can't already mock.
- **PayGovError → 504 for `initPayment`.** PAY-305 just shipped that contract; not relitigating it here.
- **OpenAPI registry update.** Already documents both 500 and 504 for `getDetails`. No change needed.
- **Multi-row partial-success-as-success.** Returning 200 when "at least one row succeeded" would be a different product decision — the ticket asks for fail-fast, we deliver fail-fast.
