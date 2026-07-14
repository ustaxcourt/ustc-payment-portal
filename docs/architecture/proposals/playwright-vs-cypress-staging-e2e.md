# Playwright vs Cypress — Staging Pay.gov E2E gate

## Purpose

Decide which browser automation tool to adopt for the **Staging post-deploy gate**: fill the real Pay.gov QA hosted collection form after `/init`, then call `/process` and `/details`.

This is **not** a replacement for the existing Jest integration suite (`src/test/integration/`), which targets the USTC Pay.gov mock and the programmatic `POST /pay/{method}/{status}` shortcut. That suite stays for local/PR/Dev. The browser tool is only for the real `qa.pay.gov` form step Staging requires.

Related: deploy backlog T2 / Stage 3 verification in [`docs/runbooks/deploy/deploy-pre-golive.md`](../../runbooks/deploy/deploy-pre-golive.md).

---

## Our constraints (what matters for the vote)

| Constraint | Why it matters |
| ---------- | -------------- |
| Third-party Pay.gov UI | Selectors live on `qa.pay.gov`, not our app — flakiness and timeouts are the risk |
| GitHub Actions staging gate | Must run headless post-deploy and fail promotion on red |
| Failure artifacts (AC) | Video / screenshots / traces uploaded for failed runs |
| Hybrid test shape | Portal API calls stay SigV4 + `fetch` (Jest helpers); browser only fills the card form |
| Thin v1 scope | Credit-card **success** only; failed/ACH/PayPal assessed separately |
| Team familiarity | DAWSON / other court apps may already use Cypress — call that out in discussion |

---

## At a glance

| | **Playwright** | **Cypress** |
| - | -------------- | ----------- |
| Maintainer | Microsoft | Cypress.io |
| Engines | Chromium, Firefox, WebKit | Chromium-family primary; Firefox/WebKit more limited historically |
| API style | `async`/`await`, fits Node/Jest orchestration | Cypress command chain (`cy.*`); harder to mix with plain Node helpers |
| Best fit for our hybrid flow | Strong — drive browser, then call existing SigV4 helpers in the same process | Weaker — API work often forced into `cy.request` / custom tasks |
| Video on failure | Built-in (opt-in recording + traces) | Built-in video |
| Trace / time-travel debug | Trace viewer (steps, DOM, network) | Time-travel UI in Cypress runner (excellent locally) |
| CI headless story | Mature; `npx playwright install --with-deps` on Actions | Mature; official Action / binary cache |
| Parallelism / sharding | First-class | Available (Dashboard / cloud features more commercial) |
| Multi-tab / cross-origin redirects | Stronger defaults for multi-origin flows | Historically more constrained; better than it was, still more ceremony |
| Pay.gov redirect bounce (`urlSuccess` / `urlCancel`) | Straightforward multi-origin navigation | Doable; expect more config around `chromeWebSecurity` / origin |
| License | Apache-2.0 | MIT (open source); some team/cloud features paid |
| Ecosystem overlap | Growing; less “court app default” | Often already used in DAWSON-style Cypress suites |

---

## How each would look for our gate

### Shared shape (either tool)

1. SigV4 `POST /init` → capture `token`, `paymentRedirect`, `transactionReferenceId`
2. Open `paymentRedirect` in the browser → fill QA test card → submit
3. SigV4 `POST /process` with `token`
4. SigV4 `GET /details/{transactionReferenceId}` → assert `success` / `processed`
5. On failure: upload video (+ trace/screenshots) as a GitHub Actions artifact; log a failure code for triage

### Playwright-shaped

- One Playwright project under e.g. `src/test/staging-e2e/`
- Reuse `sigv4Helper.ts` (or a thin shared fetch helper) from Node in the same test file
- Enable `video: 'retain-on-failure'` and `trace: 'retain-on-failure'`
- Staging workflow: install browsers once per job, run only this suite against `BASE_URL=$API_URL`

### Cypress-shaped

- Cypress project with a single staging spec
- Portal calls via `cy.request` **or** `cy.task` wrapping SigV4 Node code (SigV4 with session tokens is awkward inside pure `cy.request`)
- Video on by default; screenshots on failure
- Staging workflow: cache Cypress binary, run the staging spec only

---

## Pros / cons for *this* repo

### Playwright

**Pros**

- Cleaner fit for “API in Node + browser for form only”
- Strong multi-origin / redirect support for Pay.gov → `urlSuccess`
- Traces + video are excellent for debugging remote CI failures without a local Cypress UI
- Auto-waiting and modern defaults tend to reduce flake on third-party pages

**Cons**

- New toolchain if the broader org standard is Cypress
- Team local debug habit may be stronger with Cypress Dashboard / runner (depending on experience)

### Cypress

**Pros**

- Familiar DX if engineers already write DAWSON (or similar) Cypress tests
- Excellent interactive runner for developing the Pay.gov form selectors
- Video/screenshots are battle-tested in CI

**Cons**

- Hybrid SigV4 + browser flow is more cumbersome (tasks / plugins)
- Cross-origin Pay.gov hosted page historically needs extra care
- Heavier ceremony for a **single** staging smoke path that is not a full in-app UI suite

---

## Recommendation (for discussion — not a decision yet)

**Lean Playwright** for a Staging-only gate that is mostly API + one hosted form, unless the team’s existing Cypress muscle (and shared selectors/helpers from DAWSON) clearly outweighs that.

If we already have a well-worn Cypress pattern for Pay.gov in another repo we can copy, **Cypress is a reasonable choose-consistency vote**.

Either tool satisfies the AC (form fill + video on failure). The decision should optimize for **maintainability of one flaky third-party form**, not feature count.

---

## Decision checklist

Please vote / comment:

1. **Playwright** or **Cypress**?
2. Any org standard we should follow (e.g. DAWSON)?
3. Is video-on-failure alone enough, or do we also want Playwright traces / Cypress screenshots always?
