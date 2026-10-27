# Dependency Caveats

This document records dependencies that are intentionally **not** on their latest
version, and vulnerabilities that could not be resolved, along with the reasoning.
It is a required artifact of the recurring dependency-update work.

When you defer an upgrade or accept a vulnerability, add a dated entry below with
enough context that the next person doesn't have to re-derive the decision.

---

## How to use this file

- **Deferred upgrade** → add an entry under [Deferred upgrades](#deferred-upgrades)
  with the package, current vs. available version, the reason for waiting, and a
  link to any follow-up ticket.
- **Accepted vulnerability** → add an entry under
  [Accepted vulnerabilities](#accepted-vulnerabilities) with the advisory ID,
  severity, why it can't be fixed now, and any mitigation.
- If an upgrade is involved enough to warrant its own ticket, cut the ticket,
  notify the PO, and reference it here.

---

## Deferred upgrades

### TypeScript 6.0.3 → 7.0.2 — deferred (2026-07-09, re-confirmed 2026-10-23)

- **Current:** `^6.0.3`. **Available latest:** `7.0.2`.
- **Reason:** TypeScript 7 is a major release. Our toolchain still targets the
  6.x line — `ts-jest@^29.4.15`, `tsup@^9.0.0`, `ts-node@^10.9.2`, and
  `@biomejs/biome@^2.6.2` — and none are confirmed compatible with the TS7
  compiler/API. A blind bump risks breaking type-check, the Jest transform, and
  the build in one step, with a blast radius across the whole package.
- **Plan:** Cut a dedicated follow-up ticket to validate the toolchain against
  TS7 (upgrade `ts-jest`/`tsup`/`ts-node` first, then the compiler), and flag
  the PO. Not appropriate to bundle into recurring dependency maintenance.

### @types/node@^24.19.2 → ^26.6.5 — deferred (2026-07-20, re-confirmed 2026-10-23)

- **Current:** `@types/node@^24.19.2`. **Available latest:** `^26.6.5`.
- **Reason:** `@types/node` must track the runtime, not lead it. `engines.node`
  is `>=24.20.0 <25.0.0` and `.nvmrc` pins `24.22.1`, so the ambient Node types
  are intentionally held on the 24 line. A proposed upgrade to
  `@types/node@^26.1.1` was reverted because it would expose Node 26 APIs in
  TypeScript that are not available in the supported Node 24 runtime. This could
  allow code to compile successfully while failing at runtime and may mask
  compatibility issues. The Node type definitions must remain aligned with the
  project's supported Node version.
- **Plan:** Revisit only when the Node runtime itself moves off 24 (new
  `engines`/`.nvmrc` floor); bump `@types/node` to match in the same change.
- **Mismatch resolved (2026-10-23):** the Lambdas moved from `nodejs22.x` to
  `nodejs24.x` and esbuild now targets `node24`, so the Node 24 types match
  production.

### Node.js 24.20.0 → 24.22.1 in `.nvmrc`; `engines.node` floor held at 24.20.0 (2026-10-23)

- **Why:** 24.22.1 (2026-10-20) is the security release for CVE-2026-111497
  (Brotli decoder), plus CVE-2026-105481, -105482, -105483, -106069, -106073
  and -106074. `.nvmrc` drives every CI `setup-node` step, including `publish.yml`.
- **Why the floor stays:** DAWSON installs with `engine-strict=true` (see
  `.changeset/quiet-moons-gather.md`), so raising `engines.node` past its Node
  version fails its install. The floor states compatibility; patching is each
  consumer's runtime decision.
- **Lambda:** `.nvmrc` does not affect the Lambda runtime. The Lambdas move to
  `nodejs24.x` in the same change. That does not deliver the fix by itself: no
  `runtime_management_config` is set, so the managed runtime is in Auto mode and
  picks up AWS's patched Node (24.22.1) as AWS rolls it out. Confirm via the
  runtime version ARN in a function's `INIT_START` log line. The exposure until
  then is recorded under Accepted vulnerabilities (CVE-2026-111497).
- **Checked 2026-10-23, before the move: not yet rolled out.** Every dev cold
  start over the prior 7 days ran `nodejs:22.mainline.v122` (ARN
  `…runtime:fcbc5912…10e9`); prod and stg had no cold starts to inspect. After
  deploy, check the `nodejs:24` runtime version the same way.

### objection 3.1.5 → 4.2.0 — deferred, pinned `~3.1.5` (2026-10-14, re-confirmed 2026-10-23)

- **Current:** `~3.1.5` (was `^3.1.5`, which resolves to `3.9.1`). **Available
  latest:** `4.2.0`. `4.0.0`–`4.2.0` landed on the same `ditojs` line over
  2026-10-16 to 2026-10-18, so adopting it is now a major upgrade.
- **Reason:** after no releases since 2024-09, `3.2.0`–`3.9.1` were published
  over 2026-10-09 to 2026-10-13. They have no changelog entries, no GitHub
  releases and no tags. They are built from `ditojs/objection`, a fork by the
  same maintainer that is 306 commits and 288 files ahead of
  `Vincit/objection.js` `main`. Two of the changes touch APIs we rely on:
  `select()` is now applied to `patchAndFetchById`'s fetch query (#1938), and
  the snake-case mappers changed (#2805). `TransactionModel` uses both, including
  in `claimForProcessing`. Our tests passed on `3.9.1`, but that is not a
  substitute for reviewing a fork-sized ORM change under payment state.
- **Plan:** follow-up ticket to review the `ditojs/objection` changes against
  `TransactionModel`, wait for the release line to settle, and decide whether
  to adopt the fork. The tilde keeps routine rotations from picking it up
  until then. Widen it back to `^` in that ticket. Follow-up ticket: not yet
  cut (2026-10-23).

### Terraform provider lockfiles — what is and isn't in scope (2026-09-17, updated 2026-10-23)

- **Current:** the Terraform CLI was taken to `~> 1.17.0` repo-wide on
  2026-10-23 (from `~> 1.16.0` on 2026-09-17), with CI's `terraform_version`
  set to the matching npm-semver range `~1.17.0`. Tracked root lockfiles were
  refreshed to `hashicorp/aws` 6.70.0 the same day. On 2026-09-17 the
  deprecated `data.aws_region.current.name` was replaced with `.region` in the
  `api-gateway` and `rds-proxy` modules.
- **Why module lockfiles are not in scope at all:** `.gitignore` excludes
  `terraform/modules/**/.terraform.lock.hcl`, so module-level lockfiles are
  never committed. A clean checkout has none, and `terraform init` simply
  resolves the newest provider satisfying each module's `~> 6.0` constraint.
  Any stale module lockfile you see locally (e.g. one still pinned to
  `aws 5.100.0` with `constraints = "~> 5.0"`) is a leftover working-directory
  artifact, not a repo defect — `terraform init -upgrade` in that module clears
  it, and nothing about it reaches CI or another developer.

### dotenv@18 — `dotenv/config` types unresolved under `moduleResolution: node` (2026-10-08)

- **Current:** `dotenv@^18.0.9`. Upstream issue:
  [motdotla/dotenv#1067](https://github.com/motdotla/dotenv/issues/1067), "fixed"
  in 18.0.5 by [#1068](https://github.com/motdotla/dotenv/pull/1068).
- **Reason:** v18 removed the root `config.js`/`config.d.ts`; `./config` is only
  reachable through the `exports` map. Upstream's fix adds a `types` entry there,
  which `moduleResolution: node` (node10) never reads, so `import "dotenv/config"`
  still fails `tsc` with TS2882 even on 18.0.9 (re-checked 2026-10-23 by
  removing the declaration). Runtime (Node, Jest) is unaffected.
- **Workaround:** the ambient declaration in
  [`src/types/dotenv-config.d.ts`](../src/types/dotenv-config.d.ts), which is the
  workaround suggested in the upstream issue.
- **Plan:** delete the declaration when `moduleResolution` moves off node10, which
  TS 7 requires anyway (`ignoreDeprecations: "6.0"` only defers it). Trial runs of
  `tsc --noEmit` showed `module: commonjs` + `moduleResolution: bundler` type-checks
  with zero errors and fixes this directly; `nodenext` needs ~8 test-file fixes.
  Fold that into the TS7 toolchain ticket above.

### @changesets/cli 3.x — publish-job gotcha (2026-08-26)

- Since v3, `changeset version` exits `1` (previously `0`) when there are no
  unreleased changesets. `changesets/action@v2` gates its internal call behind
  its own "has changesets" check, so this shouldn't surface in `publish.yml`'s
  normal push-to-`main` flow — but if the publish job ever starts failing
  specifically on merges with no pending changesets, check this first.

<!-- Format:
### <package> <current> → <available> — deferred (<date>)

- **Current:** `<version/range>`. **Available latest:** `<version>`.
- **Reason:** ...
- **Plan:** ... (link a follow-up ticket if one is cut; flag the PO if pursued)
-->

---

## Vulnerabilities

### Vulnerabilities resolved via override

Be cautious about doing overrides — reserve them for cases where the dependency is unlikely to fix the issue, or would take a long time to (e.g., a transitive dependency that isn't updated because it needs to support an old version of Node). If you do need an override, add the transitive dependency in question to `overrides` at the bottom of `package.json`.

### GHSA-mh99-v99m-4gvg — brace-expansion (<=5.0.7) (high) — resolved via override (2026-07-29, updated 2026-09-08)

**From: Jest**

- **Override:** `babel-plugin-istanbul@^8.0.2`, `test-exclude@^8.0.0`, and
  `matcher-collection` → `minimatch@^10.2.2`.
- **Why an override is still needed:** the advisory was originally reached
  through three chains. Two resolved upstream and those overrides were dropped
  on 2026-09-08 (`ejs` via `@oclif/core`, `glob` via jest) — do not re-add them.
  The two that remain are each capped by an immediate parent's declared range:
  - `@jest/transform` → `babel-plugin-istanbul@^8.0.0` (npm's `latest` dist-tag
    is still `8.0.0`; the fix landed in unpublicized patches `8.0.1`/`8.0.2`),
    and `babel-plugin-istanbul` → `test-exclude@^7.0.1` (behind the fixed
    `8.0.0`).
  - `matcher-collection` (via `artillery`'s `walk-sync`) is unmaintained since
    2019 and still declares `minimatch@^3.0.2` with no newer release to wait
    for. Its one usage in `artillery` is the legacy AWS ECS/Fargate
    test-packaging path (`run-ecs`), which this repo's performance scripts
    never invoke. (We don't use AWS ECS or Fargate here.)
- **Revisit:** re-run the full verification (test suite, coverage, artillery
  CLI smoke test) whenever `jest`, `ts-jest`, or `artillery` are next bumped —
  the remaining overrides sit outside the range each parent package actually
  declares as compatible, so a future parent version could shift what's safe
  here.
- **Verified (2026-09-17, after `jest` 30.4.2 → 30.5.1 and `ts-jest` 29.4.11 →
  29.4.12):** the revisit condition above fired, so the overrides were
  re-checked rather than assumed. Still required, and each link re-confirmed
  against the registry: `@jest/transform@30.5.1` still declares
  `babel-plugin-istanbul@^8.0.0` whose `latest` dist-tag is still `8.0.0`;
  `babel-plugin-istanbul@8.0.2` still declares `test-exclude@^7.0.1` (fix is in
  `8.0.0`); and `matcher-collection@2.0.1` — still the latest, still
  unmaintained — declares `minimatch@^3.0.2`. With the overrides in place the
  tree resolves to
  `babel-plugin-istanbul@8.0.2`, `test-exclude@8.0.0`, `minimatch@10.2.6`,
  `brace-expansion@5.0.12`, and `npm audit` reports no `brace-expansion`
  finding. Full unit suite green (1051/1051 across 89 suites), coverage 96.46%
  statements / 90% branches.
- **Verified (2026-10-02, after `ts-jest` 29.4.12 → 29.4.14 and `@jest/transform`
  → 30.5.2):** overrides still required. The tree resolves to
  `babel-plugin-istanbul@8.0.2`, `test-exclude@8.0.0`, `minimatch@10.2.6` (one
  deduped copy) and `brace-expansion@5.0.12`; `npm audit` reports no
  `brace-expansion` finding. `matcher-collection` is still unmaintained
  (`latest` is `2.0.1`, still `minimatch@^3.0.2`); `artillery`'s `walk-sync`
  actually resolves `1.1.2`, which has the same `minimatch@^3.0.2` range.
  Full unit suite green (1069/1069 across 90 suites), coverage 96.55%
  statements / 90.53% branches.
- **Verified (2026-10-23, after `ts-jest` 29.4.14 → 29.4.15):** overrides still
  required. `@jest/transform@30.5.2` still declares `babel-plugin-istanbul@^8.0.0`
  (`latest` still `8.0.0`), `babel-plugin-istanbul@8.0.2` still declares
  `test-exclude@^7.0.1`, and `matcher-collection` is still `2.0.1`. The tree
  resolves to `babel-plugin-istanbul@8.0.2`, `test-exclude@8.0.0`,
  `minimatch@10.2.6` and `brace-expansion@5.0.12`; `npm audit` reports no
  `brace-expansion` finding. Full unit suite green (1067/1067 across 90 suites),
  coverage 96.54% statements / 90.48% branches.

### Removed: GHSA-g7r4-m6w7-qqqr — esbuild `tsup` override (2026-10-23)

- **Removed because:** `tsup@9.0.0` declares `esbuild@^0.28.2`. Without the
  override, `npm ls esbuild` shows a single `0.28.2` deduped across the direct
  devDependency, `tsup`, `bundle-require` and `tsx`, and `npm audit` reports no
  esbuild finding. `npm run build` JS output is byte-identical to `tsup@8.5.1`;
  the `.d.ts` only reorders union members and splits `export type {}`.
- **History below** is kept for context.

**From: tsup**

- **Override:** `tsup` → `esbuild@^0.28.2`.
- **Why an override is needed:** `tsup@8.5.1` declares `esbuild@^0.27.0`, which
  resolves to a version inside the vulnerable range. The override forces tsup's
  nested copy to `0.28.2` and dedupes it with the direct `esbuild` devDependency
  used by `build:lambda`, leaving a single copy in the tree.
- **Verified (2026-09-17):** removing the override reintroduces the advisory
  (`npm audit` reports the finding against
  `node_modules/tsup/node_modules/esbuild@0.27.7`); restoring it returns `npm
  audit` to the `csv-parse` finding alone. `npm run build` succeeds and `tsc` is
  clean with the override in place.
- **Revisit:** drop it once `tsup` declares `esbuild@^0.28.1` or newer. The
  override sits outside tsup's declared range, so re-verify the build whenever
  `tsup` is bumped.

### Removed: `@istanbuljs/load-nyc-config` → `js-yaml` (2026-09-17)

- **Was:** `@istanbuljs/load-nyc-config` → `js-yaml@^4.2.0`, forcing a full
  major over the `^3.13.1` that package declares.
- **Why it was dropped:** inert. No advisory covers the `js-yaml@3.15.2` it
  falls back to, and `load-nyc-config`'s only `js-yaml` call sits in its
  `.nycrc` YAML branch — this repo has no `.nycrc`/`nyc.config.*`, so that path
  never executes. Removing it changed nothing: `npm audit` still reports only
  the `csv-parse` finding, coverage is unchanged at 96.46% statements / 90%
  branches, and the full suite stays green.
- **Do not re-add** without an advisory that actually names `js-yaml`.

### Removed: GHSA-hp3w-g68c-fv3c — sprintf-js (moderate) — advisory withdrawn (2026-10-22)

- **Was:** accepted on 2026-10-08. Reached `sprintf-js@1.0.3` via
  `js-yaml@3.15.2` → `argparse@1.0.10`, under both Jest's
  `@istanbuljs/load-nyc-config` and `artillery`, with no patched release.
- **Why it was dropped:** GitHub withdrew the advisory on 2026-10-22, so
  `npm audit` no longer reports it even though `sprintf-js@1.0.3` is still in
  the tree. It was never in `ACCEPTED_ADVISORIES` (moderate is below the gate).

### Accepted vulnerabilities

<!-- Format:
### <advisory-id> — <package>@<version> (<severity>)

- **Reason it can't be fixed now:** ...
- **Mitigation:** ...
- **Revisit:** <condition or date>
-->

### CVE-2026-111497 / GHSA-9v8h-qqgm-4m35 — Node.js Brotli decoder (critical) — accepted until AWS patches the Lambda runtime (2026-10-23)

**From: the AWS Lambda managed runtime** (`nodejs24.x`, Auto runtime mode)

- **Reason it can't be fixed now:** the fix ships in Node 24.22.1, but Lambda
  runtime patch versions are AWS-managed. AWS has patched its base images and is
  rolling the managed runtime out gradually, with no us-east-1 ETA. We can't pin
  a patch version, and a deploy doesn't speed it up. `.nvmrc` already covers CI,
  local dev and publish. `npm audit` doesn't see this, so it isn't in
  `ACCEPTED_ADVISORIES`.
- **Mitigation:** the bug needs attacker-controlled Brotli data. No code here
  calls `zlib` directly; the only automatic `br` decoding is `node-fetch` on the
  Pay.gov SOAP calls (`src/appContext.ts`, `src/health/probePayGovWsdl.ts`), and
  those responses come only from Pay.gov over TLS. Request bodies reach the
  Lambdas as decoded API Gateway JSON.
- **Revisit:** when a function's `INIT_START` shows a `nodejs:24` runtime
  version released after 2026-10-20. Record the ARN here and move this entry to
  "Removed".

### GHSA-vfj7-8cjw-p6xm — braces (high) — accepted (2026-10-08)

**From: Artillery** (`artillery` → `chokidar@3.6.0` → `braces@3.0.3`)

- **Reason it can't be fixed now:** the advisory covers every published version
  of `braces`, and `3.0.3` is the latest, so there is no patched release to
  override to. `artillery@2.0.34` (latest) still pins `chokidar@^3.6.0`, which
  needs `braces@~3.0.2`; `chokidar@5` (which drops `braces`) is not in range.
  `npm audit fix --force` suggests downgrading `artillery` to `0.0.2`, which is
  not a real fix.
- **Previously also reached production** via `nodemon` inside
  `@ustaxcourt/ustc-pay-gov-test-server@0.3.0` (a runtime dependency). Resolved
  by upgrading to `0.4.0`, which no longer depends on `nodemon`. Verified
  2026-10-14: `npm audit --omit=dev` reports 0 vulnerabilities.
- **CI impact:** listed in `ACCEPTED_ADVISORIES` in `scripts/security-audit.sh`,
  which the `Security audit` job runs on every push and fork PR and which fails
  on any other high/critical advisory. Remove
  it from there when this entry is resolved. Because `publish.yml` waits for CI
  to succeed, a newly disclosed unaccepted advisory, even in a dev-only
  dependency, blocks npm publishes from `main` until it is fixed or accepted.
  This is intended: triage the advisory rather than bypass the job.
- **Mitigation:** the issue is stack exhaustion from deeply nested brace
  patterns. `artillery` is a devDependency, only runs via
  `scripts/run-performance-test.sh`, and `chokidar` only watches paths it is
  handed — nothing in this repo feeds attacker-controlled glob patterns to it.
  Nothing from this chain ships in the Lambda artifact.
- **Revisit:** when `braces` publishes a patched version, or `artillery` moves
  to `chokidar@4+`.
- **Re-confirmed (2026-10-23):** `braces@3.0.3` is still the latest and
  `artillery@2.0.34` still pulls `chokidar@3.6.0`.

### GHSA-xcx6-jx8p-x3h5 — @azure/msal-node@6.0.1 (high) — accepted (2026-10-26)

**From: Artillery** (`artillery@2.0.34` → `@azure/identity@4.14.0` →
`@azure/msal-node@6.0.1`)

- **Reason it can't be fixed now:** the fix is in `@azure/msal-node@7.1.0`, but
  `@azure/identity@4.14.0` (latest) requires `^6.0.0`, so `npm audit fix` cannot
  reach it. No override was taken: forcing a major version under
  `@azure/identity` is untested, for a path this repo doesn't exercise.
- **CI impact:** listed in `ACCEPTED_ADVISORIES` in `scripts/security-audit.sh`.
  Remove it from there when this entry is resolved.
- **Mitigation:** the advisory affects MSAL's authorization code flow, which can
  disclose request parameters to an attacker-controlled endpoint. `artillery` is
  a devDependency; `@azure/identity` backs only its Azure (ACI) platform, and
  `scripts/run-performance-test.sh` uses `run-lambda` (AWS). Nothing in `src/`
  imports an `@azure` package, and nothing from this chain ships in the Lambda
  artifact.
- **Revisit:** when `@azure/identity` allows `@azure/msal-node@^7.1.0`, or
  `artillery` drops `@azure/identity`.

### GHSA-8cw4-87c7-c6xx — csv-parse@<7.0.2 (moderate) — accepted (2026-09-09, re-confirmed 2026-10-23)

**From: Artillery**

- **Reason it can't be fixed now:** `artillery@2.0.34` (the latest published
  version) still pins `csv-parse@^4.16.3`, three majors behind the `7.0.2`
  fix. `npm audit fix --force`'s suggested remediation downgrades `artillery`
  to `0.0.2` — an unrelated ancient release, not a real fix. No override was
  taken: forcing `csv-parse@^7.0.2` into `artillery@4.x`'s internals for a
  three-major jump risks breaking whatever CSV handling artillery relies on,
  for a path this repo doesn't exercise.
- **Mitigation:** the vulnerability requires attacker-controlled CSV input
  parsed via `csv-parse`'s `columns` option (artillery's `--payload` CSV
  feature). This repo has no `.csv` payload files and
  `scripts/run-performance-test.sh` never passes `--payload`/CSV flags to
  `artillery run` — the vulnerable path is unreachable through anything this
  repo actually does with artillery.
- **Revisit:** if `artillery` bumps its own `csv-parse` dependency past
  `7.0.2`, or if a future performance script starts using CSV payload files
  with artillery.
- **Re-confirmed (2026-09-17):** `artillery`'s `latest` dist-tag is still
  `2.0.34` and it still declares `csv-parse@^4.16.3`; the tree still resolves to
  a single `csv-parse@4.16.3`. The mitigation also still holds — no `.csv` files
  exist anywhere in the repo and `scripts/run-performance-test.sh` still passes
  no `--payload`/CSV flag. Remains the only finding in `npm audit`
  (2 moderate, both this one chain).
- **Re-confirmed (2026-10-02):** `artillery` is still `2.0.34` and the tree
  still resolves to `csv-parse@4.16.3`. No `.csv` files in the repo and
  `scripts/run-performance-test.sh` still has no `payload`/CSV reference.
- **Re-confirmed (2026-10-14):** `artillery` is still `2.0.34` and still declares
  `csv-parse@^4.16.3`. No longer the only finding: with `braces` and
  `sprintf-js` above, these three advisories account for all 24 findings
  `npm audit` reports.
- **Re-confirmed (2026-10-23):** `artillery` is still `2.0.34` and still declares
  `csv-parse@^4.16.3`. With `sprintf-js` withdrawn, `npm audit` reports 4
  findings: this one (moderate) and the `braces` → `chokidar` → `artillery`
  chain (3 high). `npm audit --omit=dev` reports 0.
