# PAY-309 — InitPayment: Validate Pay.gov `StartOnlineCollectionResponse` with Zod

## 1. Problem statement

PAY-305 added a `ZodError` branch in [src/useCases/initPayment.ts](src/useCases/initPayment.ts) so a malformed Pay.gov response would surface as a `PayGovError` to the client. That branch is dead code today: the `StartOnlineCollectionResponse` shape is a hand-written TypeScript `type` in [src/types/StartOnlineCollectionResponse.ts](src/types/StartOnlineCollectionResponse.ts), the entity does an unchecked `as` cast in [src/entities/StartOnlineCollectionRequest.ts:64-65](src/entities/StartOnlineCollectionRequest.ts#L64-L65), and the SOAP fault envelope (`S:Fault`) is never inspected. The result: when Pay.gov returns a malformed body or a fault for `startOnlineCollection`, we either crash with an opaque `TypeError` reading `.token` on `undefined`, or we happily return `{ token: undefined }` downstream and corrupt the `transactions` row.

This ticket closes that gap by mirroring the validation/fault pattern already proven in [src/entities/CompleteOnlineCollectionWithDetailsRequest.ts](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts) (PAY-306) and [src/entities/GetDetailsRequest.ts](src/entities/GetDetailsRequest.ts).

## 2. Acceptance criteria — direct mapping

- **AC 1** — Add a Zod XML schema for `StartOnlineCollectionResponse` → §4.1
- **AC 2** — Remove the current `StartOnlineCollectionResponse` type file → §4.2
- **AC 3** — Schema file exports `type StartOnlineCollectionResponse = z.infer<typeof StartOnlineCollectionResponseSchema>` → §4.1
- **AC 4** — Replace any uses of the non-Zod `StartOnlineCollectionResponse` type with the schema-inferred version → §4.3
- **AC 5** — Do **not** register the new schema with the OpenAPI registry — it is internal-only → §3.4 + §6 gate
- **AC 6** — In [StartOnlineCollectionRequest.ts](src/entities/StartOnlineCollectionRequest.ts), `safeParse` `tokenResponse` in `useHttp()` before returning → §4.3
- **AC 7** — Update integration / unit tests as needed → §5
- **AC 8** — Add a `handleFault` function mirroring `CompleteOnlineCollectionWithDetailsRequest.ts` if a fault is detected in the envelope → §4.3

## 3. Design decisions (calling these out now so review doesn't get derailed)

### 3.1 Schema naming — disambiguating "our" shape from "Pay.gov's" shape

The ticket explicitly invites a name tweak ("you may need to tweak the schema names slightly"). Today we have:

- [src/schemas/StartOnlineCollection.schema.ts](src/schemas/StartOnlineCollection.schema.ts) — `StartOnlineCollectionSchema` / type `StartOnlineCollection`. This is **our internal request shape** (`tcsAppId`, `agencyTrackingId`, amount, urls). Confusing name — sounds like the wire response.

Naming choice for this ticket:

- **New file:** `src/schemas/StartOnlineCollectionResponse.schema.ts`
- **New schema export:** `StartOnlineCollectionResponseSchema`
- **New type export:** `StartOnlineCollectionResponse = z.infer<typeof StartOnlineCollectionResponseSchema>`

The existing `StartOnlineCollectionSchema` (request) is **left as-is.** Rationale: a rename would be a separate scope-creep refactor with no AC backing it, and a grep confirms its only consumer is a dead `startOnlineCollectionSchema` re-export in the entity ([StartOnlineCollectionRequest.ts:7](src/entities/StartOnlineCollectionRequest.ts#L7)) that is not imported anywhere. The differentiation the ticket asks for is achieved by the **Response** suffix on the new schema — no rename required.

Sister-entity precedent for the response-suffix convention: [CompleteOnlineCollectionWithDetailsResponseSchema](src/schemas/CompleteOnlineCollectionWithDetailsResponse.schema.ts).

### 3.2 Fault detection pattern

Adopt the **GetDetailsRequest** structure (cleanest of the three) — success branch returns parsed, otherwise throw `handleFault(responseBody["S:Fault"])`. See [GetDetailsRequest.ts:48-69](src/entities/GetDetailsRequest.ts#L48-L69). This is preferable to the `if/else` block in [CompleteOnlineCollectionWithDetailsRequest.ts:43-55](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts#L43-L55) — same behavior, lower indentation, and the trailing `throw` makes the control flow obvious.

The fault envelope key (`S:Fault`) is the one fast-xml-parser produces after `SoapRequest.parseXml` strips `S:Envelope`/`S:Body` ([SoapRequest.ts:62](src/entities/SoapRequest.ts#L62)). Confirmed against [GetDetailsRequest.test.ts:213-238](src/entities/GetDetailsRequest.test.ts#L213-L238).

### 3.3 What `handleFault` throws

`FailedTransactionError`, identical signature to the sister entities. **Important:** at the use-case layer in [initPayment.ts:114-120](src/useCases/initPayment.ts#L114-L120), `makeSoapRequest` is wrapped in a `try/catch` that converts **any** thrown error into `PayGovError("There was an error communicating with Pay.gov. Please retry your transaction.")` and runs `safeUpdateToFailed(agencyTrackingId, undefined, "Error communicating with Pay.gov")`. So the client-facing contract does not change — the value-add is:

1. We now record the failure (`safeUpdateToFailed` runs instead of crashing).
2. `console.error` in `useHttp` and the use-case catch will carry the **fault detail** (return_code/return_detail) and the **raw payload + Zod issues**, giving ops a fighting chance to diagnose Pay.gov outages.
3. The `ZodError` branch added in PAY-305 ([initPayment.ts:116-120](src/useCases/initPayment.ts#L116-L120)) becomes reachable for the first time.

No change to `PayGovError` status codes, no change to `handleError`.

### 3.4 OpenAPI exposure & barrel placement

The new schema is **internal-only** (it represents Pay.gov's wire response, not our public API). Two surfaces to keep it off of:

1. **OpenAPI registry** — not registered in [src/openapi/registry.ts](src/openapi/registry.ts). AC #5.
2. **Schema barrel** — not re-exported from [src/schemas/index.ts](src/schemas/index.ts). Grep-verified: neither sister Pay.gov response schema ([CompleteOnlineCollectionWithDetailsResponse.schema.ts](src/schemas/CompleteOnlineCollectionWithDetailsResponse.schema.ts), [PayGovGetDetailsResponse.schema.ts](src/schemas/PayGovGetDetailsResponse.schema.ts)) is in the barrel. The implicit convention is that wire-format schemas are imported by their entity with a direct path; only public-API-shaped schemas go through the barrel. Adding the new schema to the barrel would promote an internal vendor-protocol detail onto the convenience-import surface.

The entity imports the schema directly: `import { ... } from "../schemas/StartOnlineCollectionResponse.schema"`.

### 3.5 Schema shape

Three options, in order of permissiveness:

- **A. Loose:** `z.object({ token: z.string() })` — accepts empty strings.
- **B. Non-empty:** `z.object({ token: z.string().min(1) })`.
- **C. Exact length:** `z.object({ token: z.string().length(32) })`.

Picking **C**. Three signals confirm Pay.gov tokens are exactly 32 characters:

1. [ProcessPayment.schema.ts:11](src/schemas/ProcessPayment.schema.ts#L11) — the client-facing request schema already enforces `z.string().length(32)` on the same token coming back in, with the description "The payment token received from Pay.gov after user completes payment form. Must be exactly 32 characters long."
2. [initPayment.test.ts:193](src/useCases/initPayment.test.ts#L193) — fixture comment: `// 32 chars with the dashes removed.`
3. [lambdaHandler.test.ts:345,357](src/lambdaHandler.test.ts#L345) — two tests explicitly assert 400 for under-32 and over-32 tokens.

Choosing **C** over **B**:

- **Symmetry.** The same token flows `Pay.gov → us → client → us → Pay.gov`. The `/process` boundary already rejects non-32-char tokens. If we accept them here and they're persisted, the round-trip will fail at `/process` time with a confusing client-side validation error. Better to fail at `/init` with a focused "Pay.gov returned a malformed token" log.
- **Sandbox/regression detection.** If Pay.gov's sandbox or a future API change emits a different length, we want to know at the boundary, not three layers in.

Choosing **C** over **A**: an empty-string token would poison the in-flight reuse path in [initPayment.ts:62-69](src/useCases/initPayment.ts#L62-L69) — the 3-hour replay window would keep handing the broken token back to clients. `.length(32)` rules this out by construction.

Schema is a plain `z.object` (not `.strict()`) — fast-xml-parser may surface unknown nested elements, and we don't want to break on Pay.gov adding optional fields. Matches the convention in [CompleteOnlineCollectionWithDetailsResponse.schema.ts](src/schemas/CompleteOnlineCollectionWithDetailsResponse.schema.ts).

## 4. Implementation steps

### 4.1 Create `src/schemas/StartOnlineCollectionResponse.schema.ts`

```ts
import { z } from "zod";

// Pay.gov tokens are exactly 32 characters. The symmetric constraint lives on the
// client-facing side in ProcessPayment.schema.ts. See §3.5 for rationale.
export const StartOnlineCollectionResponseSchema = z.object({
  token: z.string().length(32),
});

export type StartOnlineCollectionResponse = z.infer<
  typeof StartOnlineCollectionResponseSchema
>;
```

No `.openapi(...)` decoration, no registry registration, no barrel re-export (see §3.4).

### 4.2 Delete `src/types/StartOnlineCollectionResponse.ts`

Confirmed sole importer is [StartOnlineCollectionRequest.ts:3](src/entities/StartOnlineCollectionRequest.ts#L3) (gets reworked in §4.3). Nothing else references it (grep verified). No `index.ts` barrel under `src/types/` to update.

### 4.3 Rewrite `src/entities/StartOnlineCollectionRequest.ts`

Target state (the meaningful diff — preserve surrounding class members and existing constructor):

```ts
import { RawStartOnlineCollectionRequest } from "../types/RawStartOnlineCollectionRequest";
import { AppContext } from "../types/AppContext";
import { FailedTransactionError } from "../errors/failedTransaction";
import { RequestType, SoapRequest } from "./SoapRequest";
import {
  StartOnlineCollectionResponse,
  StartOnlineCollectionResponseSchema,
} from "../schemas/StartOnlineCollectionResponse.schema";

// ... existing class fields, constructor, params type unchanged ...

async useHttp(appContext: AppContext): Promise<StartOnlineCollectionResponse> {
  const params: StartOnlineCollectionRequestParams = { /* unchanged */ };

  const responseBody = await SoapRequest.prototype.makeRequest(
    appContext,
    params,
    this.requestType,
  );

  if (responseBody["ns2:startOnlineCollectionResponse"]) {
    const raw =
      responseBody["ns2:startOnlineCollectionResponse"].startOnlineCollectionResponse;
    const parsed = StartOnlineCollectionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "startOnlineCollection schema validation failed",
        JSON.stringify({ raw, errors: parsed.error.issues }),
      );
      throw parsed.error;
    }
    return parsed.data;
  }

  throw this.handleFault(responseBody["S:Fault"]);
}

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

// file-local ProcessorFault — mirror the sister entities
type ProcessorFault =
  | {
      faultcode: string;
      faultstring: string;
      detail?: {
        "ns2:TCSServiceFault"?: {
          return_code: string;
          return_detail: string;
        };
      };
    }
  | undefined;
```

Also delete:

- `import { StartOnlineCollectionSchema } from "../schemas";` ([line 5](src/entities/StartOnlineCollectionRequest.ts#L5))
- `export const startOnlineCollectionSchema = StartOnlineCollectionSchema;` ([line 7](src/entities/StartOnlineCollectionRequest.ts#L7)) — dead export, grep-confirmed unused. (If the reviewer flags scope creep, we can punt this to a follow-up — but it's a one-line cleanup directly adjacent to the lines we're touching, so it goes.)

Method-style note: existing class uses `makeSoapRequest(...) { return this.useHttp(...) }` and `async useHttp(...)` as plain methods. `handleFault` uses arrow-property assignment in the sister entities for binding. Keeping that arrow form here is intentional — it matches the sister pattern and makes `request.handleFault(...)` callable from the test without `.bind`.

### 4.4 Schema barrel export

Add to [src/schemas/index.ts](src/schemas/index.ts):

```ts
export * from "./StartOnlineCollectionResponse.schema";
```

Verify [src/openapi/registry.ts](src/openapi/registry.ts) is **not touched** — internal schema.

## 5. Test strategy

### 5.1 New: `src/schemas/StartOnlineCollectionResponse.schema.test.ts`

Mirrors [CompleteOnlineCollectionWithDetailsResponse.schema.test.ts](src/schemas/CompleteOnlineCollectionWithDetailsResponse.schema.test.ts). Cases:

- accepts `{ token: "<32-char string>" }`
- rejects missing `token`
- rejects `token: ""` (empty string)
- rejects `token: "<31-char string>"` (too short — pins `.length(32)`)
- rejects `token: "<33-char string>"` (too long — pins `.length(32)`)
- rejects `token: null`
- rejects `token: 123` (wrong type)
- accepts extra unknown fields (forward-compat assertion — confirms we did not accidentally `.strict()`)

### 5.2 New: `src/entities/StartOnlineCollectionRequest.test.ts`

This file does not exist today. Add it mirroring [GetDetailsRequest.test.ts](src/entities/GetDetailsRequest.test.ts) and [CompleteOnlineCollectionWithDetailsRequest.test.ts](src/entities/CompleteOnlineCollectionWithDetailsRequest.test.ts). Cases:

1. **Happy path (XML round trip):** mock `appContext.postHttpRequest` to return a valid SOAP envelope with `ns2:startOnlineCollectionResponse > startOnlineCollectionResponse > token`. Assert returned object is `{ token }`.
2. **Schema failure — empty token:** mock `SoapRequest.prototype.makeRequest` to return `{ "ns2:startOnlineCollectionResponse": { startOnlineCollectionResponse: { token: "" } } }`. Assert `rejects.toBeInstanceOf(ZodError)` and `console.error` called with `"startOnlineCollection schema validation failed"` and a JSON string containing `errors`.
3. **Schema failure — missing token:** same as #2 with `startOnlineCollectionResponse: {}` — also `ZodError`.
4. **Empty envelope:** mock `makeRequest` to return `{}`. Assert `rejects.toBeInstanceOf(FailedTransactionError)` with message `"Unexpected response from Pay.gov: no fault detail returned"`.
5. **Fault envelope (fully populated):** mock `makeRequest` to return an `S:Fault` with `ns2:TCSServiceFault`. Assert `FailedTransactionError` with `message: "..."` and `code: <number>`.
6. **Fault envelope without detail:** assert message `"Pay.gov returned a fault without error details"`.
7. **`handleFault(undefined)`:** unit-level — assert returns `FailedTransactionError` (not throws — matches sister entities' contract; `useHttp` is the one that throws).
8. **`handleFault` with populated TCSServiceFault:** assert message + code propagation.

### 5.3 Update: `src/useCases/initPayment.test.ts`

The existing ZodError test at [initPayment.test.ts:336-353](src/useCases/initPayment.test.ts#L336-L353) currently fakes the error by rejecting the spied `makeSoapRequest` with a hand-constructed `ZodError`. Rewrite it to exercise the real `safeParse` path — but keep one synthetic-`ZodError` test too, since both arrival paths matter:

- **a. Synthetic ZodError (keep, retitled):** prove `initPayment`'s catch-block still funnels any `ZodError` thrown from `useHttp` to `PayGovError` + `safeUpdateToFailed`. Minimal change to existing test.
- **b. Real malformed response:** stub `appContext.postHttpRequest` with a SOAP envelope where `<token/>` is empty. Assert client receives `PayGovError("There was an error communicating with Pay.gov. Please retry your transaction.")` and `TransactionModel.updateToFailed` was called. This is the regression net for AC #6.
- **c. Fault envelope:** stub `appContext.postHttpRequest` with an `S:Fault` SOAP response. Assert client receives `PayGovError(...)` (same wrapper). Confirms AC #8 is wired end-to-end, not just at the entity layer.

Existing passing tests in this file (happy path, in-flight reuse, network error, etc.) must continue to pass without modification.

### 5.4 Integration tests

Confirmed by grep — neither [src/test/integration/transaction.test.ts](src/test/integration/transaction.test.ts) nor [src/test/integration/processPayment.test.ts](src/test/integration/processPayment.test.ts) references `StartOnlineCollectionResponse` or `StartOnlineCollectionSchema`. No changes required. If either test mocks `appContext.postHttpRequest` for `initPayment`, audit those fixtures to ensure they return a token-bearing envelope (they already do — they exercise the happy path).

Run the full integration suite locally before opening the PR — the new `safeParse` could surface previously-tolerated malformed test fixtures.

### 5.5 Coverage gate

[COVERAGE.md](COVERAGE.md) sets a threshold the repo enforces. The new schema file is one line of logic; the new entity test file restores parity with the sister entities. Expect coverage to go **up**, not down. If the gate dips because the new `console.error` line is uncovered, add an assertion in test 5.2 #2 that `console.error` was invoked (already in the plan).

## 6. Verification checklist (run before marking ticket done)

**Pre-work baseline** (do before any edits — gives you a known-good starting point):

- [ ] `npm test` on the branch's starting commit — confirm green; record the test count.
- [ ] `npm run lint` on the starting commit — confirm clean.

**After implementation:**

- [ ] `npm run tsc` — no errors. The `as StartOnlineCollectionResponse` cast removal must not regress.
- [ ] `npm run lint` — clean.
- [ ] `npx jest src/schemas/StartOnlineCollectionResponse.schema.test.ts` — all green.
- [ ] `npx jest src/entities/StartOnlineCollectionRequest.test.ts` — all green.
- [ ] `npx jest src/useCases/initPayment.test.ts` — all green; the new "real malformed response" and "fault envelope" cases exercise the previously-dead `ZodError` and (new) `FailedTransactionError` branches.
- [ ] `npm test` — full suite green; expected test count is baseline + new tests, every previously passing test still passes.
- [ ] `grep -r "src/types/StartOnlineCollectionResponse" src` — **empty** (file deleted, no stragglers).
- [ ] `grep -rn "StartOnlineCollectionResponse" src/openapi` — **empty** (AC #5 — schema not in OpenAPI surface).
- [ ] `npm run generate:openapi` — diff the generated spec against `main`; only the auto-bumped `info.version` should change. **No** new component schemas, no `StartOnlineCollectionResponse` key anywhere in the spec.
- [ ] Confirm a changeset entry exists at `.changeset/pay-309-validate-init-payment-response.md` (repo uses [@changesets/cli](https://github.com/changesets/changesets); CHANGELOG.md is auto-generated from these on publish).
- [ ] Manually trigger initPayment against the Pay.gov dev endpoint (or the local SOAP stub) and confirm a valid 32-char token still flows end-to-end into the database (`updateToInitiated` succeeds, `paymentRedirect` returned).
- [ ] Manually inject a malformed XML response in the local stub and confirm: (a) client receives a 504 `PayGovError`, (b) the `transactions` row reaches `failed`, (c) the log line `"startOnlineCollection schema validation failed"` appears with the raw payload and Zod issues.

## 7. Out of scope (explicit non-goals)

- Renaming the existing `StartOnlineCollectionSchema` / `StartOnlineCollection` (request shape). Not in AC; not load-bearing.
- Changing `PayGovError` status codes or `handleError` mapping.
- Adding the new schema to the OpenAPI spec (AC #5 forbids it).
- Promoting `handleFault` to a `SoapRequest` base-class method. Three entities now duplicate this — a refactor candidate, but a separate ticket (and a separate review surface).
- Tightening the `tokenResponse` access path against XML-parser quirks (e.g. node arrayification). The sister entities don't do this either; if Pay.gov starts returning arrays under `ns2:startOnlineCollectionResponse`, that's a Pay.gov spec change worth its own ticket.

## 8. Rollout & risk

- **Blast radius:** one entity, one use case, one new schema. No DB migrations, no API contract changes, no client-facing behavior change on the happy path.
- **Risk surface:** the change *can* convert previously-silent corruptions into hard failures. That is the point. Worst-case regression: a hitherto-undocumented benign Pay.gov response shape now throws. Mitigation: the `console.error` carries the raw payload, the use-case wraps it in `PayGovError` ("please retry"), and `safeUpdateToFailed` keeps the DB consistent — same client UX as a transient Pay.gov outage, fully recoverable on retry.
- **Rollback:** revert the PR. The new schema file and test file are additive; reverting reinstates the prior `as` cast. No state migration needed.

## 9. Done definition

The ticket is done when:

1. Every box in §6 is checked.
2. Every row in §2 is satisfied with a code reference in the PR description.
3. PR description includes the before/after of the `useHttp` method and links the sister-entity pattern this mirrors (PAY-306 + GetDetailsRequest).
4. CI is green on the branch; OpenAPI artifact diff (if generated in CI) shows no surface change.
