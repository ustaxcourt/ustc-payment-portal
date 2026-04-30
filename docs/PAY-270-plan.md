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
5. **Coordinate with PAY-257.** PAY-257 also edits `.env.example` and the README env-var table. See the coordination note at the bottom — start this ticket only after PAY-257 has merged to `main`.

---

## Phase 1 — Verify scope (already done in audit)

Three broad greps were run during the audit:

```bash
grep -rni "subdomain"              src/ db/ scripts/ terraform/ .github/
grep -rni "tcs.app.id\|tcsAppId"   src/ db/ scripts/ terraform/ .github/
grep -rni "cert_passphrase\b"      src/ db/ scripts/ terraform/ .github/
```

### Verified findings

- **`SUBDOMAIN`** — zero hits in code/infra. Only in `.env.example` and one README row. Trivial removal.
- **`TCS_APP_ID` (env var)** — zero `process.env.TCS_APP_ID` reads anywhere. Safe to remove. **Important distinction**: `tcsAppId` (camelCase) is used in ~20 files as a per-fee value stored in the `fees` DB table — that's a *different* concept and stays untouched.
- **`CERT_PASSPHRASE` (env var)** — zero application-code reads. Only `process.env.CERT_PASSPHRASE_SECRET_ID` is read (that's a different variable — the AWS Secrets Manager ID, which stays). The actual passphrase is fetched from Secrets Manager at runtime in stg/prod.

### Bonus finding (out of scope, file as follow-up)

The audit surfaced an **unused AWS Secrets Manager secret** called `tcs_app_id`, provisioned in dev/stg/prod ([terraform/modules/secrets/main.tf](../terraform/modules/secrets/main.tf), output via [terraform/environments/{dev,stg,prod}/outputs.tf](../terraform/environments/dev/outputs.tf)) but **not wired into any Lambda env block**. The actual `tcsAppId` values come from the `fees` table seed data, not from Secrets Manager. Out of scope for PAY-270 — file as a separate Terraform-cleanup ticket.

---

## Phase 2 — `.env.example` (1 min)

Delete three lines:

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
```

(Diff shown against the post-PAY-257 state of `.env.example`.)

---

## Phase 3 — Type declaration + the hidden gotcha

This is the principal-dev part. The audit surfaced two related cleanups that the ticket's plain reading wouldn't catch.

### 3.1 Remove `CERT_PASSPHRASE` from [src/types/environment.d.ts](../src/types/environment.d.ts)

After PAY-257 merges, the relevant declaration block will look like:

```ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
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

Remove the last line:

```diff
       PAY_GOV_DEV_SERVER_TOKEN: string;
-      CERT_PASSPHRASE: string;
     }
```

**Why this matters**: `CERT_PASSPHRASE` is declared as **required** (`: string`, not `?: string`), but no code ever reads it. The declaration is a lie — it tells future developers "this variable must be set" when in fact it's dead. Removing it keeps the type definition honest.

### 3.2 The hidden gotcha — misleading test in `appContext.test.ts`

The grep surfaces this in [src/appContext.test.ts](../src/appContext.test.ts):

```ts
it("should not use HTTPS agent when CERT_PASSPHRASE is not set, when running locally/dev", async () => {
  process.env.CERT_PASSPHRASE = "";
  // ... rest of test
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

Remove three rows: `SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`.

### 4.2 [README.md](../README.md) — reframing for AC #4

After PAY-257 merges, the env-var section will open with text similar to:

> *"Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`)."*

That sentence still treats `.env` as a generic env-var mechanism. AC #4 wants it framed as a *local-development tool*. Three candidate rewrites — pick one in review:

**Option A — explanatory (recommended default):**

```diff
-Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`).
+The `.env` file in this repo is for **local development only** — it provides
+the variables a developer needs to run the service against the local mock
+Pay.gov server. Deployed environments (dev, stg, prod) get their configuration
+from Terraform and AWS Secrets Manager — see [terraform/environments/](terraform/environments/)
+and [ADR 0006](docs/architecture/decisions/0006-app-env-vs-node-env.md).
+
+Copy `.env.example` to `.env` to start. Only variables required for local
+development are listed there.
```

**Option B — terse (if the tech lead prefers brevity):**

```diff
-Environment variables are located in `.env.<APP_ENV>` (e.g., `.env.dev`).
+`.env` is for local development only. Copy `.env.example` to `.env` to start.
+Deployed environments get their configuration from Terraform — see
+[ADR 0006](docs/architecture/decisions/0006-app-env-vs-node-env.md).
```

**Option C — table-only (if the tech lead wants minimal prose):**

Keep the existing one-liner but replace it with a single sentence and rely on the env-var table to explain each variable. Add a footnote under the table: *"This table lists only variables used in local development. See [terraform/environments/](terraform/environments/) for deployed-environment configuration."*

I'd lead with Option A in the PR — it answers AC #4 most directly and closes the "where does deployed config live" question without forcing the reader to click into the ADR.

### 4.3 Other docs — broader sweep

The doc-level grep should cover *all* markdown in the repo, not just `docs/`:

```bash
grep -rn "SUBDOMAIN\|TCS_APP_ID\|CERT_PASSPHRASE" --include="*.md" .
```

Expected hits (and their handling):
- `docs/PAY-049-database-provisioning.md:105` mentions `TCS_APP_ID` in a historical change log. **Leave as-is** — historical record of what was true at PAY-049's time.
- `README.md` — handled in 4.1 / 4.2.
- `running-locally.md`, `MAINTAINERS.md`, `db/README.md` — skim each for stale references; update if found.
- Anything in `docs/architecture/` — skim; update if found.

### 4.4 [docs/certificate.md](../docs/certificate.md)

After PAY-257, this doc references `APP_ENV` and the cert filename pattern. It does not directly reference `CERT_PASSPHRASE`. Skim to confirm — likely no change needed.

---

## Phase 5 — Verification

### 5.1 Gates

Run the same gates as PAY-257 to confirm no regressions:

```bash
npm run tsc -- --noEmit              # expect: clean
npm run lint                         # expect: clean
npm test                             # expect: same pass count
grep -rn "SUBDOMAIN\|TCS_APP_ID" src/ docs/ --include="*.md" --include="*.ts"  # expect: only PAY-049 historical mention
grep -rn "process.env.CERT_PASSPHRASE\b" src/   # expect: empty (no readers)
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

## Coordination with PAY-257

**This ticket and PAY-257 both edit `.env.example` and the README env-var table.** Three options:

| Order | Pros | Cons |
|---|---|---|
| **PAY-270 first** | Independent timeline | Conflicts with PAY-257 on both files; PAY-257 has to merge-resolve when it lands. |
| **Branch PAY-270 off PAY-257's branch** | No conflicts, can start now | Coupled to PAY-257's review cycle; can't merge until PAY-257 merges. |
| **Wait for PAY-257 to merge to `main`, then branch PAY-270 off `main`** ⭐ | Clean merge base, no coupling, AC #4 can link to the merged ADR with confidence | Costs ~1-2 days of waiting. |

**Recommended: option 3.** PAY-257 reshapes both files this ticket touches, and the AC #4 reframing builds naturally on PAY-257's "local vs deployed" framing in the ADR. Waiting is the cleanest path.

---

## Open questions for the tech lead

1. **`TCS_APP_ID` removal — confirm OK.** PAY-226/PAY-289 added the line in `.env.example` recently, but the actual `tcsAppId` wiring in code goes through the `fees` DB table, not the env var. Worth a one-line "yes, remove the env var" before I delete it.
2. **README framing tone.** Happy to match house style. The proposed paragraph in Phase 4.2 is one principal-dev opinion; the tech lead may prefer a different structure or shorter wording.
3. **Test rename in scope?** Already counted as in scope above (per Anthony's call). If the tech lead wants strict scope discipline instead, I'll move it to a follow-up.

---

## Verdict

- **Story points:** 2 (~30-45 minutes of focused work + coordination wait for PAY-257).
- **Real risk:** verifying `TCS_APP_ID` is genuinely unused (already done in audit phase).
- **Net effect:** smaller `.env.example`, honest type declaration, accurate test name, README that tells the truth about what `.env` is for.
