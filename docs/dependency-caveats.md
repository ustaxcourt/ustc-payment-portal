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

### TypeScript 6.0.3 → 7.0.2 — deferred (2026-07-09, re-confirmed 2026-10-14)

- **Current:** `^6.0.3`. **Available latest:** `7.0.2`.
- **Reason:** TypeScript 7 is a major release. Our toolchain still targets the
  6.x line — `ts-jest@^29.4.14`, `tsup@^8.5.1`, `ts-node@^10.9.2`, and
  `@biomejs/biome@^2.5.15` — and none are confirmed compatible with the TS7
  compiler/API. A blind bump risks breaking type-check, the Jest transform, and
  the build in one step, with a blast radius across the whole package.
- **Plan:** Cut a dedicated follow-up ticket to validate the toolchain against
  TS7 (upgrade `ts-jest`/`tsup`/`ts-node` first, then the compiler), and flag
  the PO. Not appropriate to bundle into recurring dependency maintenance.

### @types/node@^24.19.2 → ^26.6.5 — deferred (2026-07-20, re-confirmed 2026-10-14)

- **Current:** `@types/node@^24.19.2`. **Available latest:** `^26.6.5`.
- **Reason:** `@types/node` must track the runtime, not lead it. `engines.node`
  is `>=24.20.0 <25.0.0` and `.nvmrc` pins `24.20.0`, so the ambient Node types
  are intentionally held on the 24 line. A proposed upgrade to
  `@types/node@^26.1.1` was reverted because it would expose Node 26 APIs in
  TypeScript that are not available in the supported Node 24 runtime. This could
  allow code to compile successfully while failing at runtime and may mask
  compatibility issues. The Node type definitions must remain aligned with the
  project's supported Node version.
- **Plan:** Revisit only when the Node runtime itself moves off 24 (new
  `engines`/`.nvmrc` floor); bump `@types/node` to match in the same change.
- **Known mismatch (2026-10-14):** the deployed Lambdas still run `nodejs22.x`
  and esbuild targets `node22` (`terraform/modules/lambda/variables.tf`,
  `terraform/scripts/build-lambda.sh`). So the Node 24 types are ahead of
  production. Moving Lambda to `nodejs24.x` is being proposed as its own ticket.

### objection 3.1.5 → 3.9.1 — deferred, pinned `~3.1.5` (2026-10-14)

- **Current:** `~3.1.5` (was `^3.1.5`, which resolves to `3.9.1`). **Available
  latest:** `3.9.1`.
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
  until then. Widen it back to `^` in that ticket.

### tsup 8.5.1 → 9.0.0 — deferred (2026-10-14)

- **Current:** `^8.5.1`. **Available latest:** `9.0.0`.
- **Reason:** 9.0.0 was published to npm the same day as this update. A major
  release that new hasn't been through any real-world use yet, and our `npm run
  build` output is the published package.
- **Plan:** take it in the next rotation. 9.0.0 declares `esbuild@^0.28.2`, so
  the `tsup` → `esbuild` override below can be dropped in the same change.

### Terraform provider lockfiles — what is and isn't in scope (2026-09-17)

- **Current:** the Terraform CLI was taken to `~> 1.16.0` repo-wide, with CI's
  `terraform_version` set to the matching npm-semver range `~1.16.0`. The
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

### npm-run-all2@^9.0.3 — not a deferral; `npm outdated` false positive (2026-09-17)

- **Current:** `^9.0.3`. `npm outdated` reports **"Latest 8.0.4"**, which looks
  like we are ahead of latest and invites a "downgrade" that would be wrong.
- **Reality:** `npm view npm-run-all2 dist-tags` resolves `latest` to `9.0.3` —
  the version we are already on. The published version list confirms `9.0.0`
  through `9.0.3` all exist above `8.0.4`.
- **Action:** none. Recorded here so the next person doesn't re-derive it or
  "fix" the package back down to the 8.x line.

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

### GHSA-g7r4-m6w7-qqqr — esbuild (0.27.3–0.28.0) (low) — resolved via override (2026-09-17)

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

### Accepted vulnerabilities

<!-- Format:
### <advisory-id> — <package>@<version> (<severity>)

- **Reason it can't be fixed now:** ...
- **Mitigation:** ...
- **Revisit:** <condition or date>
-->

### GHSA-8cw4-87c7-c6xx — csv-parse@<7.0.2 (moderate) — accepted (2026-09-09, re-confirmed 2026-09-17)

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
- **Re-confirmed (2026-10-14):** `artillery` is still `2.0.34` and still declares
  `csv-parse@^4.16.3`. No longer the only finding: see `braces` and `sprintf-js`
  below, which account for the rest of the 25 findings `npm audit` reports.

### GHSA-vfj7-8cjw-p6xm — braces@<=3.0.3 (high) — accepted (2026-10-13)

**From: nodemon, Artillery (both via `chokidar@3`)**

- **Reason it can't be fixed now:** no patched release exists. `3.0.3` is the
  latest `braces` and is inside the vulnerable range. It is reached only through
  `chokidar@3.6.0`, and both parents still declare chokidar 3 in their latest
  releases: `nodemon@3.1.14` (`chokidar@^3.5.2`) and `artillery@2.0.34`
  (`chokidar@^3.6.0`). `npm audit fix --force` proposes `artillery@0.0.2`, which
  is not a real fix. No override was taken. Forcing `chokidar@4` (which drops
  `braces`) would be a major jump outside both parents' declared ranges. That is
  the same risk this file turned down for `csv-parse`.
- **Mitigation:** the advisory is a stack-exhaustion DoS from deeply nested
  brace patterns. chokidar only expands the watch globs it is given, and those
  come from our own config (`nodemon --watch src` in `npm run dev`, artillery's
  CLI). They never come from request input. Both packages are
  `devDependencies`, so neither ships to Lambda or to package consumers. The one
  runtime path, `@ustaxcourt/ustc-pay-gov-test-server@0.3.0` → `nodemon`, was
  removed by bumping that dependency to `^0.4.0` in the same change.
  `npm audit --omit=dev` reports 0 vulnerabilities.
- **CI impact:** listed in `ACCEPTED_ADVISORIES` in the `audit` job of `ci.yml`,
  which runs on every push and fails on any other high/critical advisory. Remove
  it from there when this entry is resolved.
- **Revisit:** when `nodemon` or `artillery` moves to `chokidar@4`, or when
  `braces` publishes a fix. Replacing `nodemon` with `tsx watch` (`tsx` is
  already a dependency) would remove one of the two paths.

### GHSA-hp3w-g68c-fv3c — sprintf-js@<=1.1.3 (moderate) — accepted (2026-10-13)

**From: Jest coverage, Artillery (both via `js-yaml@3` → `argparse@1`)**

- **Reason it can't be fixed now:** no patched release exists. `1.1.3` is the
  latest `sprintf-js` and is inside the vulnerable range. It is reached through
  `js-yaml@3.15.2` → `argparse@1.0.10` from `@istanbuljs/load-nyc-config`
  (via `ts-jest` → `babel-plugin-istanbul`) and from `artillery@2.0.34`
  (`js-yaml@^3.15.1`).
- **Mitigation:** `js-yaml@3` only loads `argparse` in its `bin/js-yaml.js`
  command-line entry point. The library code that `load-nyc-config` and
  `artillery` import never calls it, so `sprintf-js` is never loaded by
  anything this repo runs. All of these are `devDependencies`.
- **Not re-adding the `load-nyc-config` → `js-yaml` override:** this advisory
  names `sprintf-js`, not `js-yaml`. Re-adding the override would also only
  clear one of the two paths, because the `artillery` path would remain. The
  "do not re-add" note above still stands.
- **Revisit:** when `artillery` and `@istanbuljs/load-nyc-config` move off
  `js-yaml@3`, or when `sprintf-js` publishes a fix.
