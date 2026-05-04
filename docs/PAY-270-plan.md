# PAY-270 — `.env.example` Cleanup: Implementation Plan

## Goal

Remove three unused/misleading variables from `.env.example` (`SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`), reframe the README so it's clear that `.env` is **local-only** (deployed envs get their config from Terraform), and clean up the type declaration + test fixture that the audit surfaced as a hidden gotcha.

## Acceptance criteria (from the ticket)

1. `SUBDOMAIN` removed from `.env.example` and corresponding documentation.
2. `TCS_APP_ID` removed from `.env.example` and corresponding documentation.
3. `CERT_PASSPHRASE` removed from `.env.example` and corresponding documentation.
4. Documentation states that `.env` is only used for local development and includes variables required for local development.

## Guiding principles

1. **Verify before deleting.** A var that *looks* unused might be referenced under a different casing or via a downstream config. Run a broad grep for each before removing.
2. **Match the cleanup at every layer that mentions it.** If a var leaves `.env.example`, it should also leave the README table, the type declaration, and any documentation that references it. Half-done cleanup creates the next anti-pattern.
3. **Reframe, don't just delete.** AC #4 is the real intellectual work — a small README framing change, not just three row deletions.
4. **Stay in scope.** Don't restructure the cert handling, don't refactor Terraform, don't rewrite related tests beyond what the cleanup directly surfaces.
5. ~~**Coordinate with PAY-257.**~~ **No longer needed** — PAY-257 was merged to `main` on 2026-05-04. Branch is now rebased onto post-PAY-257 `main`; the coordination window has closed and the verifications below are against the actual post-merge state.

---

## Phase 1 — Verify scope (re-verified post-PAY-257-merge)

Three broad greps:

```bash
grep -rni "subdomain"              src/ db/ scripts/ terraform/ .github/
grep -rni "tcs.app.id\|tcsAppId"   src/ db/ scripts/ terraform/ .github/
grep -rni "cert_passphrase\b"      src/ db/ scripts/ terraform/ .github/
```

### Verified findings

- **`SUBDOMAIN`** — zero hits in code/infra. Only in [`.env.example:13`](../.env.example) and the [`README.md:87`](../README.md) env-var table row. Trivial removal.
- **`TCS_APP_ID` (env var)** — zero `process.env.TCS_APP_ID` reads anywhere. Only in [`.env.example:14`](../.env.example) and a *historical* mention in [`docs/PAY-049-database-provisioning.md:105`](../docs/PAY-049-database-provisioning.md) (which we leave as-is — it's a change-log entry from when PAY-049 was active). **Note**: TCS_APP_ID was *never* in the README env-var table, so there's no row to remove there. **Important distinction**: `tcsAppId` (camelCase) is used in ~20 files as a per-fee value stored in the `fees` DB table — that's a *different* concept and stays untouched.
- **`CERT_PASSPHRASE` (env var)** — zero application-code reads. Lives in [`.env.example:2`](../.env.example), the [`README.md:81`](../README.md) env-var table row, the [`src/types/environment.d.ts:12`](../src/types/environment.d.ts) declaration (`CERT_PASSPHRASE: string`), and the misleading test fixture in [`src/appContext.test.ts:134-135`](../src/appContext.test.ts) (the line surfaced by the audit gotcha). Only `process.env.CERT_PASSPHRASE_SECRET_ID` is read in production code (different variable — AWS Secrets Manager ID — stays).

### Bonus finding (out of scope, file as follow-up)

The audit surfaced an **unused AWS Secrets Manager secret** called `tcs_app_id`, provisioned in dev/stg/prod ([terraform/modules/secrets/main.tf](../terraform/modules/secrets/main.tf), output via [terraform/environments/{dev,stg,prod}/outputs.tf](../terraform/environments/dev/outputs.tf)) but **not wired into any Lambda env block**. The actual `tcsAppId` values come from the `fees` table seed data, not from Secrets Manager. Out of scope for PAY-270 — file as a separate Terraform-cleanup ticket.

---

## Phase 2 — `.env.example` (1 min)

Delete three lines (lines 2, 13, 14 in the current file):

```diff
 BASE_URL="http://localhost:8080"
-CERT_PASSPHRASE=""
 CLIENT_PERMISSIONS_SECRET_ID="ustc/pay-gov/dev/client-permissions"
 # Node runtime mode. One of: development | production | test.
 NODE_ENV="development"
 # Deployment topology of this service. One of: local | dev | stg | prod | test.
 APP_ENV="local"
 PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID="development-token"
 # These can be local host of our mock pay.gov test server, or the URL of the hosted version of the mock pay.gov test server.
 # Point to LOCAL Pay.gov test server
 SOAP_URL="http://localhost:3366/wsdl"
 PAYMENT_URL="http://localhost:3366/pay"
-SUBDOMAIN=""
-TCS_APP_ID=asdf-123

 # Database Configuration
```

---

## Phase 3 — Type declaration + the hidden gotcha

This is the principal-dev part. The audit surfaced two related cleanups that the ticket's plain reading wouldn't catch.

### 3.1 Remove `CERT_PASSPHRASE` from [src/types/environment.d.ts](../src/types/environment.d.ts)

The declaration block on `main` after PAY-257 looks like this (line 12 is the dead one):

```ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Node runtime mode. For deployment topology, use APP_ENV. */
      NODE_ENV: "development" | "production" | "test";
      /** Deployment topology. Read via getAppEnv() — do not access directly. */
      APP_ENV: "local" | "dev" | "stg" | "prod" | "test";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_ACCESS_TOKEN: string;
      PAY_GOV_DEV_SERVER_TOKEN: string;
      CERT_PASSPHRASE: string;          // ← never read by application code
    }
  }
}
```

Remove the dead line:

```diff
       PAY_GOV_DEV_SERVER_TOKEN: string;
-      CERT_PASSPHRASE: string;
     }
```

**Why this matters**: `CERT_PASSPHRASE` is declared as **required** (`: string`, not `?: string`), but no code ever reads it. The declaration is a lie — it tells future developers "this variable must be set" when in fact it's dead. Removing it keeps the type definition honest.

### 3.2 The hidden gotcha — misleading test in `appContext.test.ts`

[src/appContext.test.ts:134-135](../src/appContext.test.ts#L134) on `main`:

```ts
it("should not use HTTPS agent when CERT_PASSPHRASE is not set, when running locally/dev", async () => {
  process.env.CERT_PASSPHRASE = "";
  const appContext = createAppContext();
  const body = "<soap>request</soap>";

  await appContext.postHttpRequest(appContext, body);

  expect(mockFetch).toHaveBeenCalledWith(
    "https://test-soap-url.com",
    expect.objectContaining({
      agent: undefined,
    })
  );
});
```

The test **name** says the gate is `CERT_PASSPHRASE`. The **fixture** sets `CERT_PASSPHRASE = ""`. But the **code** in [src/appContext.ts:30](../src/appContext.ts#L30) actually branches on `if (keyId && certId)` — i.e., `PRIVATE_KEY_SECRET_ID` and `CERTIFICATE_SECRET_ID`. The test passes because *neither* of those secret IDs is set, not because `CERT_PASSPHRASE` is empty. The fixture line is a lie — it's setting a variable that nothing reads.

The gotcha: someone removes `CERT_PASSPHRASE` from the type declaration, the test still passes, and they conclude "great, no impact" — when the test was meaningless from the start.

**Fix** (in scope, two-line cleanup):

```diff
- it("should not use HTTPS agent when CERT_PASSPHRASE is not set, when running locally/dev", async () => {
-   process.env.CERT_PASSPHRASE = "";
+ it("should not use HTTPS agent when key/cert secret IDs are not set", async () => {
    const appContext = createAppContext();
    const body = "<soap>request</soap>";
    // ...
```

Two changes:
1. Test name describes what's actually being tested.
2. Misleading `process.env.CERT_PASSPHRASE = ""` line deleted — never affected the assertion.

---

## Phase 4 — Documentation

### 4.1 [README.md](../README.md) — env-var table

Remove **two** rows from the table:

- Line 81: `CERT_PASSPHRASE`
- Line 87: `SUBDOMAIN`

> Heads up: `TCS_APP_ID` was **never in the README env-var table**. The grep showed it only in `.env.example` and the PAY-049 historical doc. So this phase removes two rows, not three.

### 4.2 [README.md](../README.md) — reframing for AC #4

The env-var section currently opens with (line 71):

> *"Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`)."*

That sentence still treats `.env` as a generic env-var mechanism. AC #4 wants it framed as a *local-development tool*. Three candidate rewrites — pick one in review:

**Option A — explanatory (recommended default):**

```diff
-Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`).
+The `.env` file in this repo is for **local development only** — it provides
+the variables a developer needs to run the service against the local mock
+Pay.gov server. Deployed environments (dev, stg, prod) get their configuration
+from Terraform and AWS Secrets Manager — see [terraform/environments/](terraform/environments/)
+and [ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md).
+
+Copy `.env.example` to `.env` to start. Only variables required for local
+development are listed there.
```

**Option B — terse (if the tech lead prefers brevity):**

```diff
-Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`).
+`.env` is for local development only. Copy `.env.example` to `.env` to start.
+Deployed environments get their configuration from Terraform — see
+[ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md).
```

**Option C — table-only (if the tech lead wants minimal prose):**

Keep the existing one-liner but replace it with a single sentence and rely on the env-var table to explain each variable. Add a footnote under the table: *"This table lists only variables used in local development. See [terraform/environments/](terraform/environments/) for deployed-environment configuration."*

I'd lead with Option A in the PR — it answers AC #4 most directly and closes the "where does deployed config live" question without forcing the reader to click into the ADR.

### 4.3 Other docs — broader sweep (already verified)

```bash
grep -rn "SUBDOMAIN\|TCS_APP_ID\|CERT_PASSPHRASE" --include="*.md" .
```

Actual hits on `main` (post-PAY-257):

- [`README.md:81`](../README.md) (`CERT_PASSPHRASE` row) and [`README.md:87`](../README.md) (`SUBDOMAIN` row) — handled in 4.1.
- [`docs/PAY-049-database-provisioning.md:105`](../docs/PAY-049-database-provisioning.md) — `TCS_APP_ID` in a historical change log. **Leave as-is** (historical record of what was true at PAY-049's time).

That's it. **No hits in `running-locally.md`, `MAINTAINERS.md`, `db/README.md`, or `docs/architecture/`.** The broader sweep is empty beyond what 4.1 already covers.

### 4.4 [docs/certificate.md](../docs/certificate.md)

PAY-257 already updated this doc to reference `APP_ENV` and the renamed cert filenames. No mention of `CERT_PASSPHRASE` (the env var). **No changes needed.**

---

## Phase 5 — Verification

### 5.1 Gates

Run the same gates as PAY-257 to confirm no regressions:

```bash
npm run tsc -- --noEmit              # expect: clean
npm run lint                         # expect: clean
npm test                             # expect: 291/291 pass (current main baseline)
grep -rn "SUBDOMAIN\|TCS_APP_ID" --include="*.md" --include="*.ts" .   # expect: only docs/PAY-049-database-provisioning.md:105
grep -rn "process\.env\.CERT_PASSPHRASE\b" src/   # expect: empty (no readers)
```

The TypeScript compile is the most informative — if anything was reading `CERT_PASSPHRASE` that I missed, the type-removal will surface it as `string | undefined` and break the call site.

### 5.2 DoD coverage

Walking through the ticket's Definition of Done explicitly:

| DoD item | Handling |
| --- | --- |
| All code written and checked in | ✓ implicit in completion |
| All tests pass | ✓ `npm test` expected unchanged (deletion-only, except the rename in 3.2) |
| No new technical debts | ✓ removing dead declarations *reduces* technical debt |
| Test coverage ≥ 90% | N/A as a delta — no production code paths added or removed; coverage % is unchanged. (The pre-existing 84.5% baseline is the same conversation as PAY-257; not this ticket's job to fix.) |
| Unit testing | ✓ existing tests still cover the unchanged behavior |
| Integration testing | N/A — no behavior changes |
| Security testing | N/A — `CERT_PASSPHRASE_SECRET_ID` (the actual production path) is untouched. The dead `CERT_PASSPHRASE` env var was never read by production code. No new attack surface. |
| Performance testing | N/A — deletion-only refactor |
| Documentation | ✓ README + env-var table updated, `.env.example` matches |
| ADR | **Not warranted** — this is a config cleanup, not an architectural decision. PAY-257's ADR already establishes the contract this ticket cleans up. |
| Changeset | ✓ Phase 6 |

### 5.3 Risk + rollback

**Production risk: zero.** This PR touches only documentation, configuration, type declarations, and one test name. No deployed code paths change. No Lambda env block is touched. No infrastructure is touched.

**Local-developer risk: minimal.** Anyone who pulls this branch with a stale `.env` already on the new PAY-257 contract (`NODE_ENV="development"` + `APP_ENV="local"`) won't notice. The three removed variables (`SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`) are unread by any code path; if a developer's `.env` still has them, that's harmless.

**Rollback:** plain `git revert`. No migration to undo, no infrastructure to roll back.

---

## Phase 6 — Changeset

**Bump type: `patch`.** This is a documentation + config cleanup with zero changes to public API surface or runtime behavior. Matches house convention — every entry in `.changeset/` is `patch` (the package is pre-1.0).

```bash
npx changeset add --empty
```

Then fill in:

```markdown
---
"@ustaxcourt/payment-portal": patch
---

PAY-270: Remove unused vars (`SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`) from
`.env.example` and the README env-var table. Reframe the README to clarify that
`.env` is for local development only — deployed environments get their config
from Terraform. Also drop the dead `CERT_PASSPHRASE` field from the
`ProcessEnv` type declaration and clean up a misleading test fixture in
`appContext.test.ts` that referenced it.
```

---

## Phase 7 — PR description notes

Two things worth calling out explicitly so reviewers don't get confused:

1. **`tcsAppId` (camelCase) is *not* removed.** It's a per-fee value stored in the `fees` DB table and used in ~20 files. Only the dead `TCS_APP_ID` *env var* (with a similar name) is removed. The naming similarity is the trap.

2. **Out-of-scope finding filed as follow-up:** an unused AWS Secrets Manager secret (`tcs_app_id`) provisioned in dev/stg/prod but not wired to any Lambda — superseded by the `fees.tcs_app_id` DB column. Filed as: *<follow-up ticket TBD>*.

---

## Coordination with PAY-257 — resolved

PAY-257 was merged to `main` on 2026-05-04. The PAY-270 branch was rebased onto post-PAY-257 `main` cleanly (no conflicts — the plan doc doesn't overlap with PAY-257's diff).

All "after PAY-257 merges" hypotheticals in earlier drafts of this plan are now concrete file states verified against `main`. The Option-A README rewrite already references the merged [ADR 0007](../docs/architecture/decisions/0007-app-env-vs-node-env.md) with confidence.

---

## Open questions for the tech lead

1. **`TCS_APP_ID` removal — confirm OK.** PAY-226/PAY-289 added the line in `.env.example` recently, but the actual `tcsAppId` wiring in code goes through the `fees` DB table, not the env var. Worth a one-line "yes, remove the env var" before I delete it.
2. **README framing tone.** Happy to match house style. The proposed paragraph in Phase 4.2 is one principal-dev opinion; the tech lead may prefer a different structure or shorter wording.
3. **Test rename in scope?** Already counted as in scope above (per Anthony's call). If the tech lead wants strict scope discipline instead, I'll move it to a follow-up.

---

## Verdict

- **Story points:** 2 (~30-45 minutes of focused work — coordination with PAY-257 already cleared).
- **Real risk:** none remaining. All three vars verified unused on post-PAY-257 `main`. Broader doc grep returned only the expected PAY-049 historical mention.
- **Net effect:** smaller `.env.example` (3 lines removed), honest type declaration (1 dead field removed), accurate test name (1 fixture cleaned + renamed), 2 dead README rows removed, README opening prose reframed to make `.env`'s local-only purpose explicit.

## Concrete file-touch list (final)

| File | Change |
| --- | --- |
| [`.env.example`](../.env.example) | Delete lines 2 (`CERT_PASSPHRASE`), 13 (`SUBDOMAIN`), 14 (`TCS_APP_ID`) |
| [`README.md`](../README.md) | Delete env-var table rows for `CERT_PASSPHRASE` (line 81) and `SUBDOMAIN` (line 87); rewrite the line-71 opening paragraph per Phase 4.2 Option A |
| [`src/types/environment.d.ts`](../src/types/environment.d.ts) | Delete the `CERT_PASSPHRASE: string;` line (line 12) |
| [`src/appContext.test.ts`](../src/appContext.test.ts) | Rename the test at line 134 + delete the `process.env.CERT_PASSPHRASE = ""` fixture line at 135 |
| [`.changeset/<auto-generated>.md`](../.changeset/) | New, content per Phase 6 |

That's **4 source files + 1 new changeset** — net diff likely under 30 lines.
