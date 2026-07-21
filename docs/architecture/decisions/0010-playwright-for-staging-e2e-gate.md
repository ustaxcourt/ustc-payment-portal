# 10. Playwright for Staging Pay.gov E2E gate

Date: 2026-07-15

## Status

Accepted

## Context

Staging post-deploy verification must complete a real Pay.gov QA hosted collection: after SigV4 `POST /init`, a browser fills the plastic-card form on `qa.pay.gov`, then the suite calls `POST /process` and `GET /details`. The existing Jest integration suite cannot do this against Staging — it completes payment via the USTC Pay.gov **mock** shortcut (`POST /pay/{method}/{status}`), which does not exist on real QA.

We needed a headless browser tool that:

- Runs in GitHub Actions as a Staging deploy gate
- Supports video (and preferably traces) on failure for triage
- Fits a **hybrid** flow: Node/SigV4 API calls for the portal, browser only for the third-party form
- Handles multi-origin navigation (Pay.gov → `urlSuccess` / confirmation)

The team compared **Playwright** and **Cypress** for this narrow Staging gate (not as a replacement for mock-based Jest tests on PR/Dev).

## Decision

The team accepted **Playwright** on July 15, 2026 as the browser automation tool for the Staging Pay.gov E2E pipeline gate.

### Alternatives considered

**Cypress** — Strong interactive runner and familiar in some court apps (e.g. DAWSON). We rejected it for this gate because the flow is mostly SigV4/Node API work with a single third-party Pay.gov form step; Playwright’s `async`/`await` API, multi-origin defaults, and retain-on-failure video/traces fit that hybrid CI use case with less ceremony.

## Consequences

- **Hybrid API + form is straightforward** — Playwright’s `async`/`await` Node API lets us reuse existing SigV4 helpers (`src/test/integration/sigv4Helper.ts`) in the same process as the page automation, without Cypress tasks/`cy.request` ceremony.
- **CI and artifacts** — Playwright’s retain-on-failure **video** and **trace** output map cleanly to `actions/upload-artifact` for the AC requiring reviewable session artifacts on failed runs.
- **Third-party / multi-origin** — Playwright’s defaults are a better fit for Hosted Collection Pages on `qa.pay.gov` (iframes, redirects) than Cypress’s historical cross-origin constraints.
- **Org familiarity** — Some court apps use Cypress (e.g. DAWSON). We accept a second tool in *this* repo because the Staging gate is a thin, portal-owned path, not an in-app UI suite. DAWSON Cypress may still exercise client UX separately; it does not replace this gate.
- **New dependency** — Add `@playwright/test` (or Playwright test runner + config), browser install in CI (`npx playwright install --with-deps`), and `.gitignore` entries for `test-results/`, `playwright-report/`, blobs/videos.
- **Scope stays thin** — One credit-card **success** scenario against Staging first; failed card / ACH / PayPal remain assessment or follow-up stories.

## References

- Stage 3 (manual today): [`../../runbooks/deploy/deploy-pre-golive.md`](../../runbooks/deploy/deploy-pre-golive.md)
- Playwright docs: https://playwright.dev/docs/intro
