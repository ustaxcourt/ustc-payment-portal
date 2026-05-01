# PAY-290 — Fix Payment Portal Integration Tests for Local Runs: Implementation Plan

## Goal

Make the integration test suite produce the same result locally as it does in PR GitHub Actions, so a developer can reproduce a failure on their laptop before pushing and trust that a green local run means the same thing as a green CI run.

In practice this means:

- The `init`, `process`, and `transaction` integration suites run against the local `devServer.ts` Express app via plain `fetch` — no SigV4, no API Gateway.
- The `sigv4Smoke` suite is **skipped** locally (it asserts behavior of API Gateway IAM auth — there is no API Gateway locally).
- CI keeps running the full set, including `sigv4Smoke`, exactly as it does today.
- The local validation/parsing path matches the Lambda's so a 400 from the local portal looks the same as a 400 from the deployed portal.

## Story summary

> As a developer working on the payment portal, I want the integration test suite to run with the same test selection and request-validation behavior locally as it does in CI, so I can reproduce failures before pushing and trust that a passing local run means the same thing as a passing GitHub Actions run.

### Acceptance criteria (from the ticket)

1. `devServer.ts` payment endpoints validate requests the same way as the corresponding Lambda handlers.
2. Local integration test behavior has parity with PR GitHub Actions for the local-compatible suite.
3. `init`, `process`, and `transaction` integration tests run and pass locally without SigV4, using plain `fetch` against the local portal.
4. `sigv4Smoke` is skipped when running locally.
5. All integration tests continue to run and pass in PR GitHub Actions, including `sigv4Smoke`.
6. There is a documented local command/workflow developers can use to run the local integration suite consistently.

## Current state of the branch (`integration-tests-fix`)

Two commits already on the branch:

- `1572f4f` — merge from `main`.
- `756bc46` — *enable integration tests to run locally by removing deploy-only guards and adding dev server validation*.

What that commit already accomplished:

| File | What it did |
| --- | --- |
| [src/devServer.ts](../src/devServer.ts) | Wraps `express.json()` so JSON parse errors return a 400 `InvalidRequestError` (same payload shape as the Lambda's `safeJsonParse`). `/init` and `/process` now call `InitPaymentRequestSchema.parse(req.body)` / `ProcessPaymentRequestSchema.parse(req.body)` — the same Zod schemas the Lambda uses. The outer `try/catch` funnels Zod errors through `handleError`, so the 400 body matches the Lambda's exactly (`{ message: "Validation error", errors: [...] }`). |
| [src/test/integration/initPayment.test.ts](../src/test/integration/initPayment.test.ts), [processPayment.test.ts](../src/test/integration/processPayment.test.ts) | `describeWithEnv` gate relaxed from `isDeployed = baseUrl && !baseUrl.includes("localhost")` to simply `baseUrl ? describe : describe.skip`. So the suite now also runs when `BASE_URL=http://localhost:8080`. |
| [src/test/integration/sigv4Smoke.test.ts](../src/test/integration/sigv4Smoke.test.ts) | Two stray `describe(...)` blocks (`"Unsigned auth rejection"`, `"Credential guardrails"`) switched to `describeWithCreds(...)`. Now the entire file gates on `hasSigningCredentials`; with no AWS credentials in the local env, every `describe` becomes `describe.skip`. |

What that commit **did not** do — these are the gaps this plan closes:

- The `test:integration:dev` npm script still runs with `NODE_ENV=local DOTENV_CONFIG_PATH=.env.dev`. `.env.dev` does not exist in the repo (only `.env` and `.env.example` do), so dotenv silently loads nothing under that path. And `NODE_ENV=local` is not a legal Node runtime value.
- The `init`, `process`, and `transaction` test files still detect "am I local?" via `process.env.NODE_ENV === "local"`. If the script changes to `NODE_ENV=development`, those branches stop firing locally and the tests would route through `signedFetch` against `localhost` — which has no SigV4 enforcement, so it would not break, but it adds work and the wrong intent.
- `running-locally.md` does not document the integration test workflow at all — no command, no prerequisites.

Side note for context: `APP_ENV` / `src/config/appEnv.ts` does **not** exist on this branch. PAY-257 lives on a separate branch (`PAY-257-refractor-NODE-ENV`) and has not been merged. So the ticket's "if the app already supports `APP_ENV`" condition is not met here. Falling back to the ticket's primary instruction: use `NODE_ENV=development`.

---

## Guiding principles

1. **Minimal, surgical changes.** The hard part — making `devServer.ts` validate like the Lambda — is already done. Don't undo it, don't expand scope.
2. **Stop overloading `NODE_ENV`.** Use it for what Node uses it for (`development`/`production`/`test`). Don't invent new values for topology.
3. **Detect "local" by what's actually local — the URL.** `BASE_URL` containing `localhost` is the ground truth: if you're hitting a local server, you're local. This is the same signal the original `isDeployed = !baseUrl.includes("localhost")` already used; we just keep using it and stop reading `NODE_ENV` for the same fact.
4. **Don't touch CI.** The fewer moving parts in the CI workflow, the fewer ways to regress its behavior. CI calls `npm run test:integration` and `npm run test:integration:sigv4`; both stay as-is.
5. **Don't build a mock Pay.gov.** It already exists at [ustaxcourt/ustc-pay-gov-test-server](https://github.com/ustaxcourt/ustc-pay-gov-test-server). Document it, don't recreate it.

---

## Phase 1 — Fix the local test command

### 1.1 `package.json` — `test:integration:dev`

**Before:**
```jsonc
"test:integration:dev": "NODE_ENV=local DOTENV_CONFIG_PATH=.env.dev npx jest ./src/test/integration/ --testTimeout=30000",
```

**After:**
```jsonc
"test:integration:dev": "NODE_ENV=development npx jest ./src/test/integration/ --testPathIgnorePatterns=sigv4Smoke.test.ts --testTimeout=30000",
```

Three changes, each justified independently:

- `NODE_ENV=local` → `NODE_ENV=development`. `local` is not a legal Node runtime value. `development` is. `devServer.ts` already gates `/migrations` on `NODE_ENV !== "production"`, which holds for `development` — no behavior change there.
- Drop `DOTENV_CONFIG_PATH=.env.dev`. The file does not exist in the repo. With this dropped, jest's existing `setupFiles: ["dotenv/config"]` loads the canonical `.env` that `running-locally.md` already tells devs to create.
- Add `--testPathIgnorePatterns=sigv4Smoke.test.ts`. This makes the local-skip explicit, matching what `test:integration` does and matching acceptance criterion #4. Belt-and-suspenders with the `describeWithCreds` gate already inside `sigv4Smoke.test.ts`: even a developer who happens to have AWS credentials exported in their shell won't accidentally run the sigv4 smoke suite against `http://localhost:8080`, where it would be meaningless.

### 1.2 What stays the same

- `test:integration` — unchanged. CI calls this.
- `test:integration:sigv4` — unchanged. CI calls this.
- `test:db:setup` — unchanged.

---

## Phase 2 — Decouple test "isLocal" from `NODE_ENV`

The three local-compatible test files all do the same thing: pick `fetch` vs `signedFetch` based on `process.env.NODE_ENV === "local"`. With Phase 1 setting `NODE_ENV=development`, these checks would all be `false` locally. We need a different signal.

The signal we already have is `BASE_URL`. The original code already used `!baseUrl.includes("localhost")` to define `isDeployed`; we keep that exact signal but use it as `isLocal` directly.

### 2.1 [src/test/integration/initPayment.test.ts:7](../src/test/integration/initPayment.test.ts#L7)

**Before:**
```ts
const isLocal = process.env.NODE_ENV === "local";
```

**After:**
```ts
const isLocal = baseUrl?.includes("localhost") ?? false;
```

### 2.2 [src/test/integration/processPayment.test.ts:7](../src/test/integration/processPayment.test.ts#L7)

Same change as 2.1.

### 2.3 [src/test/integration/transaction.test.ts:19](../src/test/integration/transaction.test.ts#L19)

**Before:**
```ts
beforeAll(() => {
  isLocal = process.env.NODE_ENV === "local";
});
```

**After:**
```ts
beforeAll(() => {
  isLocal = process.env.BASE_URL?.includes("localhost") ?? false;
});
```

### 2.4 Why this is correct in CI as well as locally

- **CI** sets `BASE_URL=https://<api>.execute-api.us-east-1.amazonaws.com/<stage>` (see [.github/workflows/cicd-dev.yml:327](../.github/workflows/cicd-dev.yml#L327)). `isLocal = false` → tests use `signedFetch`. ✓ Matches today's CI behavior.
- **Local** sets `BASE_URL=http://localhost:8080` (from `.env`). `isLocal = true` → tests use plain `fetch`. ✓ New behavior we want.
- **No `BASE_URL` set at all** → `describeWithEnv` (the outer gate) skips the suite. Unchanged.

### 2.5 Files we deliberately do not touch

- [src/test/integration/getDetails.test.ts](../src/test/integration/getDetails.test.ts) — the acceptance criteria does not require `getDetails` to run locally; the suite remains gated on the `isDeployed` outer check and continues to skip locally and run in CI as before.
- [src/test/integration/migration.test.ts](../src/test/integration/migration.test.ts) — gated on `baseUrl.startsWith("https://")` and `NODE_ENV !== "local"`. The first condition alone is sufficient to skip locally; the redundant `NODE_ENV !== "local"` becomes harmlessly always-true after Phase 1. Leave alone.

We are also intentionally not refactoring the three near-identical `portalFetch` helpers into a shared module. That would expand the diff and is out of scope for this ticket.

---

## Phase 3 — Document the local workflow

### 3.1 `running-locally.md`

Append a new section after the existing local-startup steps:

```markdown
## Running integration tests locally

The `init`, `process`, and `transaction` integration tests run against the
local Express server (`devServer.ts`) using plain `fetch` — no SigV4 is
needed, since there is no API Gateway in front of the local portal. The
`sigv4Smoke` suite only runs against a deployed API Gateway and is skipped
locally.

Prerequisites — three things must be running on your machine before you
start the tests:

1. **Postgres** — `docker compose up` (from this repo).
2. **Pay.gov test server** — clone and start
   [ustc-pay-gov-test-server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)
   on `http://localhost:3366` (the URL `.env.example` already points
   `SOAP_URL` and `PAYMENT_URL` at). Make sure its `ACCESS_TOKEN` matches
   `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` in your `.env`.
3. **Local payment portal** — `npm run start:server` (or
   `npx ts-node src/devServer.ts`) to bind the portal to
   `http://localhost:8080`.

Then, in a fourth terminal:

​```bash
npm run test:integration:dev
​```

This runs `./src/test/integration/` with `sigv4Smoke.test.ts` excluded.
The tests detect "local" by `BASE_URL` containing `localhost`, so the same
files run signed against the deployed API in CI and unsigned against
`devServer.ts` locally with no test-side branching beyond the fetch helper.
```

We use the existing doc rather than create a new file — `running-locally.md` is already the canonical local-dev page.

### 3.2 What stays the same

- `README.md` — already mentions the Pay.gov test server in passing; no rewrite needed.
- `db/README.md` — out of scope.
- No new ADR. This is a small infrastructural fix, not an architectural decision.

---

## Phase 4 — Verification

### 4.1 Pre-commit (offline)

- `npx tsc --noEmit` — must compile clean.
- `npm test` (unit) — must stay 100% green; the touch surface here is test-only and a script, so nothing should regress.
- `npx jest ./src/test/integration/ --testPathIgnorePatterns=sigv4Smoke.test.ts --listTests` — confirm 5 files selected (`migration`, `transaction`, `getDetails`, `processPayment`, `initPayment`).
- `npx jest ./src/test/integration/sigv4Smoke.test.ts --listTests` — confirm 1 file selected, so CI's `test:integration:sigv4` is unchanged.

### 4.2 Live (requires the local stack)

With `docker compose up` + Pay.gov test server + `npm run start:server` all running:

```bash
npm run test:integration:dev
```

Expected outcome: `init`, `process`, `transaction` suites pass against `http://localhost:8080`. `getDetails` and `migration` suites skip (their outer gates are unchanged). `sigv4Smoke` is excluded by `--testPathIgnorePatterns`.

### 4.3 CI parity (cannot be exercised from a laptop)

Verified by inspection rather than execution:

- CI runs `npm run test:integration` against `BASE_URL=https://...amazonaws.com/...`. In every test file the new `isLocal` evaluates `false`, so `signedFetch` is used. Behavior identical to today.
- CI runs `npm run test:integration:sigv4` against the same deployed `BASE_URL` with AWS credentials exported. `describeWithCreds` evaluates true, so the smoke suite runs as today.

---

## Risk and rollback

- **Blast radius:** test-only — except for the package.json script, which only runs when a developer invokes it locally. CI scripts are untouched.
- **Rollback:** `git revert` on the implementation commit fully restores prior behavior. No data, no infra, no deployed code involved.
- **Failure modes:**
  - Developer doesn't have `.env` set up → `BASE_URL` undefined → `describeWithEnv` skips suites with a clear "no BASE_URL" effect. (Same behavior as today.)
  - Developer has `.env.dev` from a prior workflow → harmless; we no longer read it.
  - Pay.gov test server not running → `transaction.test.ts` will fail on the SOAP call. The new section in `running-locally.md` calls this out as a prerequisite.

---

## Out of scope (intentional non-goals)

- Folding the three `portalFetch` helpers into a shared module.
- Updating `getDetails.test.ts` and `migration.test.ts` to also run locally — the ticket scopes the local suite to `init`, `process`, `transaction`.
- Removing the redundant `NODE_ENV !== "local"` check in `migration.test.ts`. Always-true after Phase 1; harmless.
- Anything in `devServer.ts` beyond what the existing branch commit already did. The validation already matches the Lambda; the JSON parse error path already matches; expanding further risks regressing what's working.
- `APP_ENV` / `src/config/appEnv.ts`. That work belongs to PAY-257.
- A new mock Pay.gov server. The existing test-server repo is the canonical one.
