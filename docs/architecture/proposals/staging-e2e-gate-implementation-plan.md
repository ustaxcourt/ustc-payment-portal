# Implementation Plan — Staging Pay.gov E2E pipeline gate

**Status:** Ready to execute (Playwright chosen)
**Audience:** Implementing engineer
**Related:** Deploy backlog T2, Stage 3 in [`deploy-pre-golive.md`](../../runbooks/deploy/deploy-pre-golive.md), ADR [`0010-playwright-for-staging-e2e-gate.md`](../decisions/0010-playwright-for-staging-e2e-gate.md)

---

## 0. Read this first

### What the ticket is really asking for

After every Staging deploy, automatically prove a **real** Pay.gov QA credit-card success through:

`POST /init` → fill Pay.gov hosted form → `POST /process` → `GET /details`

Fail the staging promotion path if that fails. Upload **video** (and useful debug output) on failure.

### What this is _not_

| Do not                                                              | Why                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Point existing `src/test/integration/*` at Staging and expect green | Those tests complete payment via the **mock** shortcut `POST /pay/{method}/{status}`. Staging redirects to **real** `qa.pay.gov`, which has no such route. |
| Replace PR/Dev Jest integration tests with browser E2E              | Mock suite stays fast and broad. Staging gate is a **second**, thin suite.                                                                                 |
| Automate failed card / ACH / PayPal in v1                           | AC says assess LOE; card **success** is the minimum gate.                                                                                                  |
| Hit Production Pay.gov                                              | Staging only. Prod gets a separate read-only smoke (other ticket).                                                                                         |

### Architectural target (end state)

```
PR / Dev / local
  └── Jest integration tests + USTC Pay.gov mock (+ markPayment shortcut)

Staging deploy (this ticket)
  └── New staging E2E gate:
        SigV4 /init
        → browser fills qa.pay.gov form (official QA test card)
        → SigV4 /process
        → SigV4 /details assert success/processed
        → on fail: video + structured failure code artifacts
        → job failure blocks promote-to-prod workflow trust

Prod
  └── out of scope here
```

### Non-negotiables

1. **Fail closed** — red gate means do not treat Staging as verified.
2. **Secrets never in git** — QA test PANs only in GitHub Actions secrets / Secrets Manager.
3. **Reuse SigV4 helpers** — do not reinvent signing; extend [`src/test/integration/sigv4Helper.ts`](../../../src/test/integration/sigv4Helper.ts).
4. **Typed public errors / deliberate messages** — follow existing patterns if you add any shared helpers.
5. **Campsite** — only touch files needed for this feature; leave them cleaner.
6. **No `console.*` in production paths** — test/CI scripts may log; Lambda code changes are out of scope unless required.
7. **Clean up local probe artifacts** — do not commit `body.json` / `init.json`; **remove** any temporary Staging `client-permissions` entry (e.g. SSO GODADMIN “Local Staging probe”) as soon as ad-hoc probing is done — keep only the CI deployer entry until the E2E gate lands with the fees it needs.

---

## 1. Acceptance Criteria → concrete deliverables

| AC                                                                                                | Deliverable                                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| E2E CC success on Staging (`/init`, `/process`, `/details`) for a fake petition/client obligation | New staging E2E suite; **use fee that works on QA** (see §2.1)                                |
| Fill credit card on Pay.gov to trigger success                                                    | Playwright page object fills QA hosted form (§3–§5)                                           |
| Assess failed CC / ACH / PayPal                                                                   | Short written findings section in this folder or ticket comment (not necessarily implemented) |
| Video artifacts on failed tests in GHA                                                            | `actions/upload-artifact` of browser video (and traces/screenshots if available)              |
| Codes + debugging info for auto/manual handling                                                   | Structured failure codes in logs + optional JSON summary file uploaded with artifacts         |

---

## 2. Prerequisites (do these before writing much code)

Complete these in order. **Do not skip.** Several are blockers discovered during Staging probes.

### 2.1 Confirm which fee Staging can use against Pay.gov QA

**Verified empirically (2026-07-14):**

| Fee                                 | `tcs_app_id`            | Staging `/init` vs QA                                         |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `PETITION_FILING_FEE`               | `TCSUSTAXCOURTPETITION` | **Fails** — Pay.gov `4019`: no agency application for that id |
| `NONATTORNEY_EXAM_REGISTRATION_FEE` | `TCSUSTAXCOURTANAEF`    | **Works** — returns `paymentRedirect` to `qa.pay.gov`         |

**Plan requirement:** v1 staging E2E **must** use `NONATTORNEY_EXAM_REGISTRATION_FEE` until Fiscal registers petition in QA.

Metadata for that fee (required by schema):

```json
{
  "email": "staging-e2e@example.com",
  "fullName": "Staging E2E",
  "accessCode": "STAGINGE2E"
}
```

Also file/follow up: update [`staging-deploy.yml`](../../../.github/workflows/staging-deploy.yml) smoke test currently uses `PETITION_FILING_FEE` — that smoke is **broken or brittle** against current QA. Either change smoke to non-attorney fee (same PR or immediate follow-up) or get petition app id fixed in QA. Do not leave a lying green path.

### 2.2 Obtain official Pay.gov QA test card(s)

Dummy cards (e.g. `4111 1111 1111 1111`) **do not** succeed on QA. Blocked until Fiscal / PO provides official QA test instruments.

Store in GitHub Actions (suggested names — adjust to org convention):

| Secret                      | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `PAYGOV_QA_CC_SUCCESS_PAN`  | Card number for success path                                  |
| `PAYGOV_QA_CC_SUCCESS_EXP`  | Expiry (`MM/YY` or whatever the form wants — document format) |
| `PAYGOV_QA_CC_SUCCESS_CVV`  | CVV                                                           |
| `PAYGOV_QA_CC_SUCCESS_NAME` | Optional cardholder name if required                          |

**Checklist**

- [ ] Success card obtained and stored in repo Actions secrets (Staging environment if used)
- [ ] Documented where the numbers came from (ticket comment, not the repo)
- [ ] Confirmed manually once: `/init` → browser submit with that card → `/process` → `/details` success

### 2.3 Browser automation tool — **Playwright** (decided)

Team decision: **Playwright**. See ADR [`0010-playwright-for-staging-e2e-gate.md`](../decisions/0010-playwright-for-staging-e2e-gate.md).

Install (when scaffolding):

```bash
npm install -D @playwright/test
npx playwright install chromium   # local; CI uses install --with-deps
```

Use Chromium only for the Staging gate unless a Pay.gov QA quirk forces another engine.

### 2.4 Confirm CI caller is authorized

Staging `client-permissions` secret (`ustc/pay-gov/stg/client-permissions`) must allow the **role that signs requests in GHA** (today: `ustc-payment-processor-stg-cicd-deployer-role`) for `NONATTORNEY_EXAM_REGISTRATION_FEE`.

Today CI entry may only list `PETITION_FILING_FEE`. Update secret to include non-attorney (or `["*"]` for the CI role only if team agrees).

**Checklist**

- [ ] CI deployer role `allowedFeeKeys` includes `NONATTORNEY_EXAM_REGISTRATION_FEE`
Also update §2.4 checklist: local GODADMIN probe entry was removed (restored CI-only) on 2026-07-15 — keep it that way until the E2E lands with the correct fee allowlist for the CI role.

### 2.5 Stable `urlSuccess` / `urlCancel`

Pay.gov must redirect somewhere after submit. For automation:

- Prefer a known static HTTPS URL that returns 200, **or**
- A trivial “payment complete” page under an existing USTC staging host if product wants branding

Must be HTTPS and reachable. `https://example.com` worked for `/init` SOAP; confirm it still works after form submit (or pick a better landing URL). Browser test should wait for navigation to success URL **or** a Pay.gov confirmation state — spike this once with the real form (§4).

---

## 3. Design — module layout (Playwright)

Keep portal HTTP in TypeScript Node helpers; keep browser fill isolated. Prefer the **Playwright test runner** for the E2E file so video/trace config is native — call `signedFetch` helpers from the test (same Node process).

Suggested tree:

```text
src/test/staging-e2e/
  README.md                      # how to run locally against Staging
  playwright.config.ts           # or repo-root playwright.config.ts pointing at this dir
  config.ts                      # BASE_URL / fee / timeouts / env validation
  failureCodes.ts                # enum of machine-readable codes
  portalApi.ts                   # init / process / details via signedFetch
  paygovForm.ts                  # Playwright page object: fill + submit card
  creditCardSuccess.spec.ts      # orchestrates the full flow
  reporters/                     # optional: write failure-summary.json
```

**Playwright config must include** (names may match tool defaults):

- `video: 'retain-on-failure'`
- `trace: 'retain-on-failure'`
- `screenshot: 'only-on-failure'`
- Single project: Chromium
- `testDir` → `src/test/staging-e2e`
- Generous timeouts for Pay.gov QA

**Reuse**

- `signedFetch` / credential helpers from `src/test/integration/sigv4Helper.ts`
- Do **not** import or call `markPayment` from `transaction.test.ts`

**npm scripts** (add to `package.json`):

```json
"test:staging-e2e": "playwright test --config src/test/staging-e2e/playwright.config.ts"
```

Script must:

- Require `BASE_URL`
- Use SigV4 (not `APP_ENV=local`)
- Exit non-zero on failure

**Jest:** ensure `src/test/staging-e2e/` is **not** picked up by unit Jest (`jest-unit.config.ts` already excludes integration paths — add an explicit ignore for `staging-e2e` if needed so `npm test` never hits Staging).

---

## 4. Thin spike (1–2 days, before full CI wiring)

Goal: de-risk Pay.gov DOM + secrets, with almost no workflow complexity.

### Spike steps

1. Manually `/init` with non-attorney fee (curl or portalApi helper).
2. Open `paymentRedirect` in headed Playwright (Chromium).
3. Record selectors for:
   - card number, expiry, CVV, name, submit
   - iframes (Pay.gov often uses them — plan for frame locators)
4. Submit success test card; note post-submit URL / confirmation text.
5. Call `/process` with token; call `/details` with `transactionReferenceId`.
6. Assert `paymentStatus === "success"` and latest `transactionStatus === "processed"`.
7. Enable **video on failure** locally; confirm a failed run produces a file.

### Spike Definition of Done

- [ ] Selectors documented in `paygovForm.ts` (or comments) with note that Pay.gov may change DOM
- [ ] One local successful end-to-end against Staging
- [ ] Known flake risks listed (timeouts, iframe, slow QA)
- [ ] Short note: failed CC / ACH / PayPal feasibility (§8)

**Do not merge CI gate until spike DoD is green.**

---

## 5. Implementation steps (after spike + tool choice)

Execute in order. Each step has a Definition of Done.

### Step A — Config + failure codes

**Create** `src/test/staging-e2e/config.ts`:

- Read `BASE_URL` (required)
- Fee = `NONATTORNEY_EXAM_REGISTRATION_FEE`
- Timeouts (generous for QA: e.g. navigation 60s, form 90s)
- Card fields from `process.env` (fail fast with clear message if missing)
- `urlSuccess` / `urlCancel` from env with sane defaults

**Create** `src/test/staging-e2e/failureCodes.ts`:

| Code                   | When                                         |
| ---------------------- | -------------------------------------------- |
| `ENV_MISSING`          | Required env/secret absent                   |
| `INIT_FAILED`          | `/init` non-200 or missing token/redirect    |
| `INIT_BAD_REDIRECT`    | redirect not qa.pay.gov (or unexpected host) |
| `PAYGOV_NAV_FAILED`    | browser cannot load payment page             |
| `PAYGOV_FORM_FAILED`   | selectors missing / fill error               |
| `PAYGOV_SUBMIT_FAILED` | submit did not reach success state           |
| `PROCESS_FAILED`       | `/process` non-success                       |
| `DETAILS_MISMATCH`     | `/details` not success/processed             |
| `UNEXPECTED`           | catch-all                                    |

Every failure path must log:

```text
STAGING_E2E_FAILURE_CODE=<CODE>
transactionReferenceId=...
token=<redacted or last4-only if needed>
httpStatus=...
```

Do **not** log full PAN/CVV. Follow logger redaction spirit even in tests.

**DoD:** importing config with missing env throws with `ENV_MISSING`.

---

### Step B — Portal API helper

**Create** `portalApi.ts`:

- `initNonAttorneyPayment()` → `{ token, paymentRedirect, transactionReferenceId }`
- `processPayment(token)`
- `getDetails(transactionReferenceId)`
- All via `signedFetch` when not local

Match request bodies to OpenAPI / schemas:

- Init: fee + non-attorney metadata + `urlSuccess` / `urlCancel`
- Process: `{ token }` only
- Details: path param = client’s `transactionReferenceId`

**DoD:** running only the API helpers against Staging with a mock mark is impossible; instead unit-test pure URL builders if any, and rely on spike for live proof. Prefer small focused tests for failure-code mapping without hitting network.

---

### Step C — Pay.gov form page object

**Create** `paygovForm.ts` using Playwright (`Page` / frame locators):

- `completeSuccessfulPlasticCard(page, cardSecrets)`
- Explicit waits; prefer role/label selectors over brittle CSS when possible
- Handle iframe if discovered in spike
- Return when success redirect or confirmation is observed
- On failure, ensure video retain-on-failure is configured at the runner level

**DoD:** headed local run completes form with QA success card.

---

### Step D — Orchestration test

**Create** single scenario test: **Credit Card — Success**

Pseudocode:

```text
1. validateEnv()
2. init → capture ids
3. log STAGING_E2E_STEP=init ok
4. browser open paymentRedirect
5. completeSuccessfulPlasticCard
6. log STAGING_E2E_STEP=paygov ok
7. processPayment(token)
8. assert process response shapes / statuses
9. getDetails(transactionReferenceId)
10. assert paymentStatus success + transaction processed
11. log STAGING_E2E_STEP=done
12. on any throw → set FAILURE_CODE, write failure-summary.json, rethrow
```

**DoD:** one green local run; one intentional fail produces video + failure code.

---

### Step E — Wire `staging-deploy.yml`

After existing migrate + existing `/init` smoke (or after fixing smoke fee — §2.1):

1. `actions/checkout` already present — ensure code at promoted SHA is available.
2. Setup Node (match `.nvmrc`).
3. `npm ci`
4. Install Playwright browsers / OS deps: `npx playwright install --with-deps chromium`
5. Ensure AWS creds from existing OIDC deploy role remain in env (`AWS_ACCESS_KEY_ID`, etc.).
6. Set:
   - `BASE_URL: ${{ steps.tf_outputs.outputs.api_url }}`
     (workflow uses `API_URL` today — map explicitly)
   - Card secrets from GitHub Secrets
7. Run `npm run test:staging-e2e`
8. **Always** upload artifacts on failure (and optionally always retain last run):

```yaml
- name: Upload staging E2E failure artifacts
  if: failure()
  uses: actions/upload-artifact@...
  with:
    name: staging-e2e-artifacts
    path: |
      src/test/staging-e2e/test-results/**
      playwright-report/**
      failure-summary.json
```

Exact paths should match `playwright.config.ts` `outputDir` — pin them in the spike and keep the workflow in sync.

9. Job must fail the workflow on test failure (default). Confirm nothing `continue-on-error: true` is set on this step.

**DoD:** dry-run on a branch / workflow_dispatch; green path and forced-red path both behave.

---

### Step F — Docs

Update:

1. [`docs/runbooks/deploy/deploy-pre-golive.md`](../../runbooks/deploy/deploy-pre-golive.md) Stage 3 — say automated gate now runs; human verification reduced / optional dual-check for first N releases.
2. [`docs/deploy-backlog.md`](../../deploy-backlog.md) T2 — mark done or point to this plan when merged.
3. `src/test/staging-e2e/README.md` — local how-to (SSO, secrets, command).

**DoD:** a new engineer can follow README without Slack archaeology.

---

### Step G — Hygiene PR checklist

- [ ] No PAN/CVV in repo, logs, or screenshots committed
- [ ] `.gitignore` covers Playwright output (`test-results/`, `playwright-report/`, `blob-report/`, etc.)
- [ ] No scratch `body.json` / `init.json` committed
- [ ] `npm run lint` / `npm run tsc` clean for touched TS
- [ ] Unit suite still excludes staging E2E / doesn’t require Staging secrets
- [ ] Staging `client-permissions` CI role allows non-attorney fee
- [ ] Temporary GODADMIN probe entry removed from Staging secret
- [ ] Smoke test fee strategy decided (§2.1)

---

## 6. Failure handling contract (for humans + automation)

Every red run should allow triage in &lt;5 minutes:

1. Open GHA run → download `staging-e2e-artifacts`
2. Watch video
3. Read log line `STAGING_E2E_FAILURE_CODE=...`
4. Read `failure-summary.json` if present:

```json
{
  "code": "PROCESS_FAILED",
  "baseUrl": "https://….amazonaws.com/stg",
  "transactionReferenceId": "…",
  "httpStatus": 504,
  "message": "…",
  "step": "process"
}
```

Optional later: page CloudWatch `initPayment` / `processPayment` log groups in the summary — not required for v1 if video + codes exist.

---

## 7. Local runbook (implementer)

```bash
# 1. SSO into Staging account
aws sso login --profile ent-apps-payment-portal-workloads-stg
export AWS_PROFILE=ent-apps-payment-portal-workloads-stg
export AWS_SDK_LOAD_CONFIG=1
eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"

# 2. API URL
export BASE_URL="$(terraform -chdir=terraform/environments/stg output -raw api_gateway_url)"

# 3. Card secrets (local only — never commit)
export PAYGOV_QA_CC_SUCCESS_PAN=...
export PAYGOV_QA_CC_SUCCESS_EXP=...
export PAYGOV_QA_CC_SUCCESS_CVV=...

# 4. Ensure your role is in client-permissions for NONATTORNEY_EXAM_REGISTRATION_FEE
#    (CI uses deployer role; local needs your role or assume a registered one)

# 5. Run
npm run test:staging-e2e
```

If you see `Client not registered`: update `ustc/pay-gov/stg/client-permissions` and wait ~5m or bounce `initPayment` Lambda description to clear cache.

If you see Pay.gov `4019` for petition: wrong fee — use non-attorney.

---

## 8. Assessment deliverable (failed / ACH / PayPal)

Write a short memo (ticket comment or `docs/architecture/proposals/staging-e2e-payment-method-assessment.md`) after spike:

| Method     | QA support?                     | Gate suitable?       | LOE to automate | Recommendation                  |
| ---------- | ------------------------------- | -------------------- | --------------- | ------------------------------- |
| CC success | Yes (with official cards)       | Yes                  | This ticket     | **Ship in v1**                  |
| CC fail    | ? (need Fiscal docs)            | Maybe                | M               | Follow-up if QA has decline PAN |
| ACH        | Partial — async pending→settled | Poor for deploy gate | L               | Do not gate deploys on ACH      |
| PayPal     | ? (wallet/sandbox)              | Unclear              | L+              | Separate story                  |

**DoD for AC:** memo exists; no requirement to implement non-success paths in the same PR.

---

## 9. Suggested sequencing / PR split

Principals prefer small reviewable PRs:

| PR                            | Contents                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| **PR 1**                      | `@playwright/test` + config + spike form fill + local README (no workflow gate yet) |
| **PR 2**                      | Full orchestration test + failure codes + gitignore                                |
| **PR 3**                      | `staging-deploy.yml` gate + secrets docs + artifact upload                         |
| **PR 4** (optional same as 3) | Fix smoke test fee; Stage 3 runbook update; assessment memo                        |

Do not merge PR 3 until PR 1–2 proven against Staging with real QA card.

---

## 10. Risks and mitigations

| Risk                                  | Mitigation                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pay.gov DOM changes                   | Page object isolation; video on fail; one scenario only                                   |
| QA flakiness / outages                | Clear failure codes; don’t auto-retry `/process`; optional single retry only on page load |
| Secrets missing in GHA                | Fail fast `ENV_MISSING` with actionable message                                           |
| Wrong fee in smoke vs E2E             | Align both on non-attorney until petition QA fixed                                        |
| Permissions cache staleness           | Document Lambda bounce; CI role already warm after deploy                                 |
| Token expiry if form too slow         | Keep timeouts bounded; don’t add steps before submit                                      |
| Logging PII (email, name in metadata) | Use obvious fake metadata; avoid logging full metadata objects if not redacted            |

---

## 11. Explicit out of scope

- Re-litigating Playwright vs Cypress (decided — ADR 0010)
- Production E2E payments
- Expanding mock Jest scenarios
- Dashboard verification (not deployed on Staging)
- Relying on DAWSON (or other client) Cypress as a substitute for this repo’s Staging gate

---

## 12. Final Definition of Done (ticket complete)

- [ ] Playwright installed; ADR 0010 and this plan aligned
- [ ] Official QA success card in GHA secrets; never in git
- [ ] Staging E2E: non-attorney fee → Playwright form → process → details success
- [ ] `staging-deploy.yml` runs suite post-deploy; failure fails workflow
- [ ] Failed runs upload Playwright video (+ trace/screenshot)
- [ ] Failure codes appear in logs / summary artifact
- [ ] Assessment of fail/ACH/PayPal written
- [ ] Runbook Stage 3 updated
- [ ] Smoke test fee inconsistency addressed
- [ ] Lint/tsc clean; no scratch secrets/files committed
- [ ] Temporary Staging client-permissions probe cleaned up

---

## 13. Where you start Monday morning (literally)

1. Read §0–§2 of this plan and ADR 0010.
2. Chase PO/Fiscal for QA test card (§2.2) — **parallelize**, do not idle.
3. Update Staging `client-permissions` so CI deployer can charge `NONATTORNEY_EXAM_REGISTRATION_FEE` (§2.4).
4. Scaffold Playwright (`@playwright/test` + config) and execute **§4 spike** before any workflow YAML.
5. Only then Steps A→G.

If blocked on cards, you can still land: Playwright scaffolding, failure-code module, portalApi helpers, smoke-test fee fix, and runbook draft — but do not fake a green Pay.gov submit.