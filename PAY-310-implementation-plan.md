# PAY-310 — `getDetails`: Validate Pay.gov response with a schema + fault handling

## Goal

`getDetails` already calls `safeParse` against [`PayGovGetDetailsResponseSchema`](src/schemas/PayGovGetDetailsResponse.schema.ts) thanks to PAY-306, but the entity is still inconsistent with its sibling `CompleteOnlineCollectionWithDetailsRequest`:

1. The `useHttp()` happy path returns a hand-rolled `TransactionDetails` type that duplicates the schema-inferred type.
2. The method does **not** branch on the SOAP envelope: it goes straight to `responseBody["ns2:getDetailsResponse"]?.getDetailsResponse` and lets Zod reject `undefined`. A real Pay.gov `S:Fault` (e.g. `TCSServiceFault` from PAY-305-style behavior) produces a noisy `ZodError` rather than a typed `FailedTransactionError` carrying the `return_code` / `return_detail`.

This ticket closes that gap. The contract after this change matches [`CompleteOnlineCollectionWithDetailsRequest.useHttp`](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts#L30-L55):

| Envelope shape | Result |
| --- | --- |
| `responseBody["ns2:getDetailsResponse"]` present + schema-valid | resolve `PayGovGetDetailsTransaction` |
| `responseBody["ns2:getDetailsResponse"]` present + schema-invalid | throw `ZodError` (logged with raw payload) |
| `responseBody["ns2:getDetailsResponse"]` absent (any reason — fault or otherwise) | throw `FailedTransactionError` via `handleFault(responseBody["S:Fault"])` |

The use-case wrapper in [`src/useCases/getDetails.ts`](src/useCases/getDetails.ts#L114-L126) already catches *anything* thrown from `makeSoapRequest` and converts it to `PayGovError(500)` — so this entity change is API-contract-neutral for the client. The point is **diagnostic fidelity**: on-call sees a typed `FailedTransactionError` with `return_code` in the logs instead of a stack of Zod issues complaining about missing keys.

---

## Story points & complexity

**3 story points.** Most of the headline work (`PayGovGetDetailsResponseSchema`, `safeParse` wiring, success-path unit tests) shipped in PAY-306 — see [.changeset/swift-kiwis-fail.md](.changeset/swift-kiwis-fail.md). What remains is a focused cleanup + a fault path; well under a day for a developer familiar with the codebase, padded for review.

### What makes it non-trivial

1. **Type-removal: verified compatible.** The local `TransactionDetails` type ([src/entities/GetDetailsRequest.ts:11-19](src/entities/GetDetailsRequest.ts#L11-L19)) and the schema-inferred [`PayGovGetDetailsTransaction`](src/schemas/PayGovGetDetailsResponse.schema.ts#L29-L31) are structurally identical at the field level *and* compatible with every consumer. I walked the call chain:

    | Consumer | Signature | Field passed in | Inferred-type field | Compatible? |
    | --- | --- | --- | --- | --- |
    | [parseTransactionStatus](src/useCases/parseTransactionStatus.ts#L6-L8) | `(status: PayGovTransactionStatus) => TransactionStatus` | `result.transaction_status` | `transaction_status: z.enum(["Success","Settled","Cancelled","Failed","Retired","Pending","Received","Waiting","Submitted"])` | ✅ — the 9-member Zod enum and the 9-member TS union in [src/types/TransactionStatus.ts](src/types/TransactionStatus.ts) are the same literal set |
    | [toPaymentMethod](src/utils/toPaymentMethod.ts#L3) | `(paymentType: string) => PaymentMethod \| null` | `result.payment_type` | `payment_type?: string` | ✅ — use case guards with `result.payment_type ? toPaymentMethod(...) : null` ([getDetails.ts:135](src/useCases/getDetails.ts#L135)), narrowing the optional before the call |
    | [TransactionModel.updateAfterPayGovResponse](src/db/TransactionModel.ts#L161-L169) | `(..., transactionDate: string \| undefined, paymentDate: string \| undefined)` | `result.transaction_date`, `result.payment_date` | `transaction_date?: string`, `payment_date?: string` | ✅ — `T?` in inferred type = `T \| undefined` in the signature |
    | [TransactionModel.updateAfterPayGovResponse](src/db/TransactionModel.ts#L161-L169) | `(..., paygovTrackingId: string, ...)` | `result.paygov_tracking_id` | `paygov_tracking_id: string` | ✅ |

    `npm run tsc` on the baseline (before my change) is clean. Applying §1.1 verbatim will keep it clean — no consumer requires `agency_tracking_id` or `transaction_amount`, which are the only two fields whose optionality differs between the two types (`TransactionDetails` already had both as `?`-optional, so no consumer is depending on them being required).

2. **Fault envelope shape: already trusted in production.** `handleFault` consumes a `ProcessorFault`-shaped object ([CompleteOnlineCollectionWithDetailsRequest.ts:73-84](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts#L73-L84)) — a hand-rolled TS type for what `fast-xml-parser` (with the project's [`xmlOptions`](src/xmlOptions.ts)) produces from a TCS SOAP fault. That shape is already validated *by shipping* — `processPayment` has been running it against real Pay.gov fault responses since PAY-305. We replicate the type and the helper verbatim. Do **not** "improve" it by Zod-parsing the fault, because (a) it diverges from the existing entity, (b) the fault detail is logged-and-bubbled, not consumed by downstream code, and (c) we want the entity to fail-soft on weird fault shapes rather than mask the original error with a parsing error.

    **Test implication:** the §2.1.C end-to-end fault test does **not** need to parse a hand-written fault envelope through `fast-xml-parser` — that would re-prove what PAY-305 already proved. Instead, mock `SoapRequest.prototype.makeRequest` to return the same `ProcessorFault`-shaped object the production entity already trusts. See §2.1.C below.

3. **Existing test expectations change.** The current [`GetDetailsRequest.test.ts`](src/entities/GetDetailsRequest.test.ts#L197-L208) asserts `ZodError` when `responseBody` is `{}`. After this change, the same input would route through `handleFault(undefined)` and throw `FailedTransactionError`. That test needs to be re-aimed at a new contract — flipping the assertion in place would hide the regression rather than catch it.

4. **`useCases/getDetails.ts` wraps everything in `PayGovError(500)`.** The use-case-level `catch` is intentional — `getDetails` is a read and the row must stay `pending` on any refresh failure (PAY-306 changeset spells this out). The new `FailedTransactionError` thrown by the entity will therefore *also* be coerced to `PayGovError(500)` at the use-case layer. That is correct, not a bug — the value of throwing a typed error from the entity is **logging + future composability**, not user-visible behavior. Resist the urge to special-case `FailedTransactionError` in `getDetails.ts` to mark the row failed (the way `processPayment.ts:78-83` does); for a read, "Pay.gov is briefly unreachable" and "Pay.gov says the transaction faulted" both leave the DB row untouched. Calling that out so the next reviewer doesn't ask.

5. **OpenAPI poisoning is easy to do by accident.** Anyone re-exporting the new schema from `src/schemas/index.ts` *will* leak `PayGovGetDetailsResponse` into [`docs/openapi.json`](docs/openapi.json) the next time the generator runs — even without an explicit `registry.register()`, because `extendZodWithOpenApi` mutates the schema once any sibling schema in the barrel uses `.openapi(...)`. Verify by grep that the new schema is **not** in [`src/schemas/index.ts`](src/schemas/index.ts) after this change. (It already isn't — keep it that way.)

### Files touched

| File | Change | Net lines |
| --- | --- | --- |
| [src/entities/GetDetailsRequest.ts](src/entities/GetDetailsRequest.ts) | Remove local `TransactionDetails`; switch return type to `PayGovGetDetailsTransaction`; branch on `ns2:getDetailsResponse` vs `S:Fault`; add `handleFault` | ~+15 / -10 |
| [src/entities/GetDetailsRequest.test.ts](src/entities/GetDetailsRequest.test.ts) | Replace the "missing envelope ⇒ ZodError" test; add `handleFault` happy + degenerate cases; add a "Pay.gov returns S:Fault ⇒ FailedTransactionError" integration-style test on the entity | ~+60 |
| [src/useCases/getDetails.ts](src/useCases/getDetails.ts) | None expected — `result.transaction_status` / `.payment_type` / `.transaction_date` / `.payment_date` all stay structurally identical. *Verify with `npm run tsc`* | 0 |
| [src/test/integration/getDetails.test.ts](src/test/integration/getDetails.test.ts) | None. This file only runs against deployed envs, and Pay.gov's dev fake doesn't emit faults on demand for `getDetails`. Entity-level unit tests are the correct coverage layer. | 0 |
| [src/schemas/PayGovGetDetailsResponse.schema.ts](src/schemas/PayGovGetDetailsResponse.schema.ts) | None — already exports the inferred type as `PayGovGetDetailsTransaction` | 0 |
| [src/schemas/index.ts](src/schemas/index.ts) | None — and **must stay** "none" (see complexity note #5) | 0 |
| `.changeset/<new>.md` | New changeset, `patch` bump, describes the entity-only refactor | ~+20 |

That is the **entire diff surface**. If a reviewer sees a change to `src/openapi/registry.ts` or `src/schemas/index.ts` in this PR, it should be rejected — those changes belong to a different ticket.

---

## Phase 1 — Entity refactor

### 1.1 Rewrite `src/entities/GetDetailsRequest.ts`

The full target file. This is what should land — annotated where it diverges from today.

```ts
import { AppContext } from "../types/AppContext";
import { FailedTransactionError } from "../errors/failedTransaction";
import { RequestType, SoapRequest } from "./SoapRequest";
import {
  PayGovGetDetailsResponseSchema,
  PayGovGetDetailsTransaction,
} from "../schemas/PayGovGetDetailsResponse.schema";

export type RawGetDetailsRequest = {
  tcsAppId: string;
  payGovTrackingId: string;
};

export type GetRequestRequestParams = {
  paygov_tracking_id: string;
  tcs_app_id: string;
};

export class GetRequestRequest extends SoapRequest {
  private payGovTrackingId;
  private requestType: RequestType = "getDetails";

  constructor(request: RawGetDetailsRequest) {
    super(request);
    this.payGovTrackingId = request.payGovTrackingId;
  }

  makeSoapRequest = async (
    appContext: AppContext,
  ): Promise<PayGovGetDetailsTransaction> => {
    return this.useHttp(appContext);
  };

  useHttp = async (
    appContext: AppContext,
  ): Promise<PayGovGetDetailsTransaction> => {
    const params: GetRequestRequestParams = {
      tcs_app_id: this.tcsAppId,
      paygov_tracking_id: this.payGovTrackingId,
    };

    const responseBody = await SoapRequest.prototype.makeRequest(
      appContext,
      params,
      this.requestType,
    );

    // Branch the same way CompleteOnlineCollectionWithDetailsRequest does:
    // success envelope → schema-validate; anything else → treat as a SOAP fault.
    if (responseBody["ns2:getDetailsResponse"]) {
      const raw = responseBody["ns2:getDetailsResponse"].getDetailsResponse;
      const parsed = PayGovGetDetailsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        // Pay.gov's getDetails response does not contain PCI data — payment_type is
        // a string like "ACH"/"PLASTIC_CARD" and tracking IDs are server-side
        // identifiers, not cardholder data. If that ever changes, redact before logging.
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
    }

    throw this.handleFault(responseBody["S:Fault"]);
  };

  // Mirrors CompleteOnlineCollectionWithDetailsRequest.handleFault verbatim.
  // The duplication is deliberate — see complexity note #2 in the plan.
  handleFault = (fault: ProcessorFault) => {
    if (!fault) {
      return new FailedTransactionError(
        "Unexpected response from Pay.gov: no fault detail returned",
      );
    }

    if (!fault.detail || !fault.detail["ns2:TCSServiceFault"]) {
      return new FailedTransactionError(
        "Pay.gov returned a fault without error details",
      );
    }

    return new FailedTransactionError(
      fault.detail["ns2:TCSServiceFault"].return_detail,
      Number(fault.detail["ns2:TCSServiceFault"].return_code),
    );
  };
}

type ProcessorFault =
  | {
      faultcode: string;
      faultstring: string;
      detail: {
        "ns2:TCSServiceFault": {
          return_code: string;
          return_detail: string;
        };
      };
    }
  | undefined;
```

### 1.2 What was removed

- `TransactionDetails` type (lines 11–19 of the current file). It was never re-exported and was only ever a return-type alias — `git grep TransactionDetails src/` confirms zero external consumers.
- Implicit reliance on `?.` to convert a missing envelope into a `ZodError`. That behavior is now explicit and typed.

### 1.3 What was NOT changed

- `RawGetDetailsRequest` and `GetRequestRequestParams` exports stay — [`src/entities/SoapRequest.ts:6-21`](src/entities/SoapRequest.ts#L6-L21) imports them.
- The class name remains `GetRequestRequest` (the misnomer is pre-existing — fixing it is out of scope and would touch 6+ call sites).
- `parseTransactionStatus` is still called in the use case. The inferred-type return is structurally identical (`transaction_status: "Success" | "Settled" | ...`), so the consumer compiles unchanged. **Verify with `npm run tsc`.**

---

## Phase 2 — Tests

### 2.1 Rewrite/extend `src/entities/GetDetailsRequest.test.ts`

Three test categories to touch:

#### A. Replace the "missing envelope ⇒ ZodError" test

This is the only existing test that asserts on a now-incorrect contract. Replace it:

**Before** ([src/entities/GetDetailsRequest.test.ts:197-208](src/entities/GetDetailsRequest.test.ts#L197-L208)):

```ts
it("throws a ZodError when the SOAP envelope is missing the ns2:getDetailsResponse key", async () => {
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({});

  const request = new GetRequestRequest({
    tcsAppId: "test-app-id",
    payGovTrackingId: mockPayGovTrackingId,
  });

  await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
    ZodError,
  );
});
```

**After:**

```ts
it("throws FailedTransactionError when the SOAP envelope is missing the ns2:getDetailsResponse key", async () => {
  // Empty envelope: no success response and no S:Fault — handleFault(undefined)
  // path. This is the "Pay.gov returned a malformed/empty envelope" case.
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({});

  const request = new GetRequestRequest({
    tcsAppId: "test-app-id",
    payGovTrackingId: mockPayGovTrackingId,
  });

  await expect(request.makeSoapRequest(appContext)).rejects.toBeInstanceOf(
    FailedTransactionError,
  );
});
```

#### B. Add a `handleFault` block (mirrors `CompleteOnlineCollectionWithDetailsRequest.test.ts:56-66`)

```ts
describe("handleFault", () => {
  const request = new GetRequestRequest({
    tcsAppId: "test-app-id",
    payGovTrackingId: mockPayGovTrackingId,
  });

  it("returns a FailedTransactionError when fault is undefined", () => {
    expect(request.handleFault(undefined)).toBeInstanceOf(FailedTransactionError);
  });

  it("returns a FailedTransactionError when fault has no detail", () => {
    const result = request.handleFault({
      faultcode: "soap:Server",
      faultstring: "boom",
    } as never);
    expect(result).toBeInstanceOf(FailedTransactionError);
    expect(result.message).toBe(
      "Pay.gov returned a fault without error details",
    );
  });

  it("carries return_code and return_detail when fault is fully populated", () => {
    const result = request.handleFault({
      faultcode: "soap:Server",
      faultstring: "TCS fault",
      detail: {
        "ns2:TCSServiceFault": {
          return_code: "42",
          return_detail: "Transaction not found",
        },
      },
    });
    expect(result).toBeInstanceOf(FailedTransactionError);
    expect(result.message).toBe("Transaction not found");
    expect(result.code).toBe(42);
  });
});
```

#### C. Add one wiring test: `useHttp` → `handleFault`

Exercises the `useHttp` → `handleFault` branch end-to-end at the *parsed-body* layer. We deliberately do **not** stand up a hand-rolled fault XML and feed it through `fast-xml-parser` — see complexity note #2. The shape we mock here is the same `ProcessorFault` shape `CompleteOnlineCollectionWithDetailsRequest.handleFault` consumes in production, which is the contract we are mirroring:

```ts
it("throws FailedTransactionError when the envelope has no ns2:getDetailsResponse and carries an S:Fault", async () => {
  // Same parsed-body shape CompleteOnlineCollectionWithDetailsRequest.handleFault
  // is built around — mirrored verbatim so both entities agree on the fault contract.
  jest.spyOn(SoapRequest.prototype, "makeRequest").mockResolvedValue({
    "S:Fault": {
      faultcode: "S:Server",
      faultstring: "TCSServiceFault",
      detail: {
        "ns2:TCSServiceFault": {
          return_code: "404",
          return_detail: "Transaction not found",
        },
      },
    },
  });

  const request = new GetRequestRequest({
    tcsAppId: "test-app-id",
    payGovTrackingId: mockPayGovTrackingId,
  });

  const promise = request.makeSoapRequest(appContext);
  await expect(promise).rejects.toBeInstanceOf(FailedTransactionError);
  await expect(promise).rejects.toMatchObject({
    message: "Transaction not found",
    code: 404,
  });
});
```

> Note on the two `await expect(promise)` calls: both `.rejects.*` matchers re-evaluate against the same already-rejected promise — no re-execution, no double-invocation of the mock. This is the canonical pattern for asserting multiple things about a rejected value in Jest.

### 2.2 Imports diff for the test file

```diff
- import { ZodError } from "zod";
  import { GetRequestRequest } from "./GetDetailsRequest";
  import { SoapRequest } from "./SoapRequest";
  import { testAppContext as appContext } from "../test/testAppContext";
+ import { FailedTransactionError } from "../errors/failedTransaction";
+ import { ZodError } from "zod";
```

`ZodError` import stays — the schema-rejection tests still need it. The reordering is just cosmetic (groups external deps together).

### 2.3 Coverage gate

Project gate is **≥ 90% line coverage** (see [COVERAGE.md](COVERAGE.md)). After this change:

- `GetDetailsRequest.useHttp` has both branches covered (success-envelope + fault-envelope).
- `GetDetailsRequest.handleFault` has all three internal branches covered (undefined, missing detail, populated).
- Net effect on the package: neutral-to-positive. No new untested code paths.

Run before pushing:

```
npm run test:unit -- --coverage --collectCoverageFrom='src/entities/GetDetailsRequest.ts'
```

If coverage on the entity is < 100% after these tests, something is wrong — the file is small enough that 100% is the realistic bar.

---

## Phase 3 — Verification

### 3.1 Type check (regression guard)

```
npm run tsc
```

Consumer compatibility is already proven by inspection (see complexity note #1 — the four-row table). `tsc` is the regression guard, not the existence proof. A red `tsc` here means either (a) the entity diff drifted from §1.1, or (b) a consumer was added between writing this plan and shipping it — in which case re-walk the table.

Baseline (current `main`, before any change) is clean — I ran it.

### 3.2 OpenAPI guard

```
grep -n "PayGovGetDetails" src/schemas/index.ts src/openapi/registry.ts
```

Expected output: **empty**. If either file picks up the schema, revert and re-do the diff — this is the OpenAPI-poisoning guard from complexity note #5.

```
npm run generate:openapi
git diff docs/openapi.json docs/openapi.yaml
```

`generate:openapi` runs [src/openapi/generate.ts](src/openapi/generate.ts), which writes **both** [docs/openapi.json](docs/openapi.json) and [docs/openapi.yaml](docs/openapi.yaml). Expected diff: empty for both. If either file changed, the schema leaked into the public OpenAPI surface — revert and find the import that pulled it in.

### 3.3 Run the suite

```
npm run test:unit
npm run test:integration   # local — proves nothing about Pay.gov fault path but
                           # guards against the use-case-layer error coercion regressing
```

### 3.4 Manual smoke (optional, only if Pay.gov dev fake is reachable)

The dev fake at `@ustaxcourt/ustc-pay-gov-test-server` does not currently emit a `getDetails` fault on any input ([node_modules/.../handleGetDetails.ts](node_modules/@ustaxcourt/ustc-pay-gov-test-server/src/useCases/handleGetDetails.ts) is success-only). If the smoke matters for risk reduction, temporarily patch the fake to throw a fault for a known `paygov_tracking_id` and confirm `/details/:id` returns `PayGovError(500)` (the use-case-layer coercion of our new `FailedTransactionError`) — then revert the patch. **Do not check the fake patch in.**

---

## Phase 4 — Changeset

Create `.changeset/<random-slug>.md` (use `npx changeset` to get a slug, or hand-write one matching the [config.json](.changeset/config.json) format):

```md
---
"@ustaxcourt/payment-portal": patch
---

PAY-310: `GetRequestRequest` now branches on the SOAP envelope before parsing.
A success envelope is Zod-validated against `PayGovGetDetailsResponseSchema`
(throws `ZodError` on contract drift); any other envelope shape is routed
through `handleFault` and throws `FailedTransactionError` carrying Pay.gov's
`return_code` / `return_detail` for on-call diagnosis. Behavior at the public
API is unchanged — `getDetails` continues to coerce all entity-layer failures
to `PayGovError(500)` per PAY-306. Internal-only refactor: the duplicate
`TransactionDetails` type was removed in favor of the schema-inferred
`PayGovGetDetailsTransaction`.
```

Patch bump is correct — no public API change, no breaking consumer change.

---

## Out of scope (call out in PR description)

- **Renaming `GetRequestRequest` → `GetDetailsRequest`** to match the file name. Pre-existing misnomer, touches 6+ files, no functional benefit — file a follow-up ticket if it bothers a reviewer.
- **Zod-parsing the fault envelope.** Tempting, but diverges from `CompleteOnlineCollectionWithDetailsRequest` for no payoff. Both entities should look the same; the time to unify them is in a dedicated refactor that touches both call sites simultaneously.
- **Special-casing `FailedTransactionError` in `useCases/getDetails.ts`** (the way `processPayment.ts:78-83` does). For a read endpoint, "Pay.gov briefly failed" must not mark the row failed — see PAY-306's changeset for the rationale. The use-case-layer coercion stays as-is.
- **Adding the schema to OpenAPI docs.** Explicit acceptance criterion: *internal-facing only*. The OpenAPI surface continues to advertise the *outbound* `GetDetailsResponse` from [`src/schemas/GetDetails.schema.ts`](src/schemas/GetDetails.schema.ts), which is a different (and intentionally distinct) shape.

---

## Definition of done

1. ✅ [`src/entities/GetDetailsRequest.ts`](src/entities/GetDetailsRequest.ts) matches §1.1 verbatim; `TransactionDetails` is gone; `handleFault` exists; `useHttp` branches on `ns2:getDetailsResponse`.
2. ✅ [`src/entities/GetDetailsRequest.test.ts`](src/entities/GetDetailsRequest.test.ts) contains the rewrites/additions in §2.1; coverage on the entity is 100%.
3. ✅ `npm run tsc` is clean.
4. ✅ `npm run test:unit` and `npm run test:integration` (local) are green.
5. ✅ `grep "PayGovGetDetails" src/schemas/index.ts src/openapi/registry.ts` returns nothing; `git diff docs/openapi.json` is empty.
6. ✅ A `patch`-level changeset exists describing the entity-only refactor.
7. ✅ PR description explicitly lists the four "out of scope" items above, so reviewers don't ask why each isn't included.

When all seven boxes are checked, the ticket is shippable.
