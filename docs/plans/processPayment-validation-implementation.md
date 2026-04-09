# Implementation Plan: `processPayment` Request Validation

**Goal:** Make `POST /processPayment` reject invalid requests with HTTP 400 and a clear error message, matching the pattern already used by `initPaymentHandler`.

**Why now:** [src/lambdaHandler.ts:78-89](src/lambdaHandler.ts#L78-L89) parses the JSON body but skips schema validation, so malformed requests reach the use case and fail deep in the SOAP call instead of at the edge.

---

## Step 1 — Tighten `ProcessPaymentRequestSchema`

**File:** [src/schemas/ProcessPayment.schema.ts:9-16](src/schemas/ProcessPayment.schema.ts#L9-L16)

**Change:**
- Add `.strict()` to the object so unknown keys are rejected (payment endpoints should fail loudly on unexpected fields).
- Add `.min(1)` to `token` so empty strings are rejected.
- If the story requires `appId`, add it as a required `z.string().min(1)`. **Open question for the team — confirm before coding.**

**Why:** Schema is the single source of truth for request shape. Tightening it here means every call site (handler, tests, OpenAPI doc) gets the stricter rules for free.

**Done when:**
- `ProcessPaymentRequestSchema.safeParse({ token: "" }).success === false`
- `ProcessPaymentRequestSchema.safeParse({ token: "x", extra: 1 }).success === false`
- Existing tests that use the schema still pass (or are updated if they relied on lax behavior).

---

## Step 2 — Wire schema validation into `processPaymentHandler`

**File:** [src/lambdaHandler.ts:78-89](src/lambdaHandler.ts#L78-L89)

**Change:** After `safeJsonParse`, call `ProcessPaymentRequestSchema.safeParse(rawBody)`. On failure, return `handleError(parsed.error)`. On success, pass `parsed.data` to `lambdaHandler`. Mirror the exact structure of [initPaymentHandler at src/lambdaHandler.ts:59-76](src/lambdaHandler.ts#L59-L76).

**Why:** This is the one-line gap that the story is about. `handleError` already maps `ZodError` → 400 with a structured body, so no new error-handling code is needed — we just need to actually run the validation.

**Done when:**
- `processPaymentHandler({ body: "{}" })` returns `statusCode: 400`.
- `processPaymentHandler({ body: '{"token":"abc"}' })` reaches the use case with a typed `ProcessPaymentRequest`.
- No changes needed in `handleError.ts` or `processPayment.ts`.

**Depends on:** Step 1.

---

## Step 3 — Unit tests for `processPaymentHandler`

**File:** [src/lambdaHandler.test.ts](src/lambdaHandler.test.ts) (add a new `describe("processPaymentHandler")` block)

**Change:** Add tests mocking `appContext.getUseCases().processPayment`. Reuse the existing `makeEvent` helper if present, otherwise add one. Cover:

| # | Input | Expected |
|---|---|---|
| 1 | Valid body `{ token: "abc" }` | 200, use case called once with typed request |
| 2 | `body: null` | 400, message contains "missing body" |
| 3 | `body: ""` | 400, message contains "missing body" |
| 4 | `body: "{not json"` | 400, message contains "invalid JSON" |
| 5 | `body: "{}"` | 400, `errors` array has issue at path `["token"]` |
| 6 | `body: '{"token":123}'` | 400, Zod type error |
| 7 | `body: '{"token":""}'` | 400, Zod min-length error |
| 8 | `body: '{"token":"x","extra":1}'` | 400 (strict mode) |
| 9 | Use case throws `PayGovError` | Status from the error, not 500 |
| 10 | Use case throws generic `Error` | 500, generic message |

For every 400 case, assert both `statusCode` **and** body shape `{ message, errors }` — the shape is the public contract.

**Why:** These are fast, deterministic, and lock in the validation behavior so future refactors don't regress it. Cases 9 & 10 guard the error-propagation path through `handleError`.

**Done when:** All tests pass; running with Step 2 reverted causes cases 5–8 to fail (sanity check that they actually test the new code).

**Depends on:** Step 2.

---

## Step 4 — Integration test coverage

**File:** new file `src/test/integration/processPayment.test.ts`, following the pattern in [src/test/integration/initPayment.test.ts](src/test/integration/initPayment.test.ts)

**Change:** Add four end-to-end cases hitting the real API Gateway event path:
1. Happy path against sandbox/stubbed Pay.gov.
2. Malformed JSON body → 400.
3. Missing `token` → 400 with the expected error shape.
4. Unknown field → 400 (confirms strict mode survives the real event round-trip).

**Why:** Unit tests prove the handler logic works in isolation. Integration tests prove API Gateway actually delivers the payload shapes we expect — some gateways intercept malformed JSON before Lambda runs, and we want to catch that if it happens.

**Deliberately not covered here:** the full unit matrix. Integration is slower; duplicating cases 1–10 would double test cost without added confidence.

**Done when:** All four cases pass against the integration environment.

**Depends on:** Step 2.

---

## Step 5 — (Optional) Extract `parseAndValidate` helper

**File:** [src/lambdaHandler.ts](src/lambdaHandler.ts)

**Change:** Pull the `safeJsonParse` + `schema.safeParse` pattern into one helper: given `event.body` and a Zod schema, return `{ value }` or a pre-built error `APIGatewayProxyResult`. Migrate both `initPaymentHandler` and `processPaymentHandler` to use it.

**Why:** Eliminates the two-step dance that will otherwise be copy-pasted into every future endpoint. Pure refactor — no behavior change, existing tests should pass unchanged. Not required for the story, but a cheap consistency win once Steps 1–3 are in.

**Done when:** Both handlers are one call shorter; all tests from Step 3 still pass with no modifications.

**Depends on:** Step 3 (so tests exist to catch regressions).

---

## Step 6 — (Optional) Verify base64 body handling

**File:** [src/lambdaHandler.ts:41-57](src/lambdaHandler.ts#L41-L57)

**Change:** Check whether API Gateway is configured to base64-encode any request bodies for this endpoint (`event.isBase64Encoded === true`). If yes, `safeJsonParse` needs a decode step before `JSON.parse`. If no, document it and move on.

**Why:** Currently a latent gap — if a client ever sends a binary content type, `safeJsonParse` will feed base64 to `JSON.parse` and return "invalid JSON" instead of something actionable. Worth a 10-minute check against the gateway config, not worth coding defensively without confirmation.

**Done when:** Either (a) confirmed not applicable and noted in the PR description, or (b) decode branch added and tested.

**Depends on:** nothing.

---

## Execution order

**Minimum viable slice (closes the story):** Steps 1 → 2 → 3.

**Recommended full scope:** Steps 1 → 2 → 3 → 4 → 5 in one PR, or split 1–3 and 4–5 into two PRs if you want a faster initial merge.

**Step 6** is independent and can land anytime.

---

## Dependencies & parallelization

```
Step 1 (tighten schema)
   │
   ▼
Step 2 (wire validation into handler)
   │
   ├──────────────┬──────────────┐
   ▼              ▼              │
Step 3          Step 4           │
(unit tests)    (integration)    │
   │                             │
   ▼                             │
Step 5 (extract helper) ◄────────┘

Step 6 (base64 check) — fully independent
```

### Can run in parallel

- **Step 3 ∥ Step 4** — once Step 2 lands, unit tests and integration tests touch different files and can be written simultaneously by two people (or two PRs).
- **Step 6 ∥ everything** — a config investigation, not tied to any code in Steps 1–5. Can happen at any time, even before Step 1.

### Strictly sequential

- **Step 1 → Step 2** — Step 2 imports the tightened schema; without `.strict()` / `.min(1)` in place, the Step 3 cases for "empty token" and "unknown field" will fail.
- **Step 2 → Step 3** — no handler behavior to test until Step 2 wires it up.
- **Step 2 → Step 4** — integration tests need the real 400 to assert against.
- **Step 3 → Step 5** — Step 5 is a refactor; it needs Step 3's unit tests as a regression safety net.

### Practical scheduling

- **Solo developer, one PR:** 1 → 2 → 3 → 4 → 5, slot in 6 wherever convenient.
- **Two developers splitting work after Step 2:** Dev A takes Step 3, Dev B takes Step 4 in parallel; whoever finishes first picks up Step 5. Step 6 goes to whoever has spare capacity.
- **Fastest story close:** 1 → 2 → 3 is the critical path. Everything else can trail in follow-up PRs.

---

## Out of scope

- Changing the `{ message, errors }` response envelope.
- Adding a middleware framework (middy, etc.).
- Auth/authz changes — already handled upstream by `extractCallerArn` + `authorizeClient`.
- Rate limiting — API Gateway concern.
