# Dependency Caveats

This document records dependencies that are intentionally **not** on their latest
version, and vulnerabilities that could not be resolved, along with the reasoning.
It is a required artifact of the recurring dependency-update work.

When you defer an upgrade or accept a vulnerability, add a dated entry below with
enough context that the next person doesn't have to re-derive the decision.

---

## How to use this file

- **Deferred upgrade** → add an entry under #deferred-upgrades
  with the package, current vs. available version, the reason for waiting, and a
  link to any follow-up ticket.
- **Accepted vulnerability** → add an entry under
  #accepted-vulnerabilities with the advisory ID,
  severity, why it can't be fixed now, and any mitigation.
- If an upgrade is involved enough to warrant its own ticket, cut the ticket,
  notify the PO, and reference it here.

---

## Deferred upgrades

### TypeScript 6.0.3 → 7.0.2 — deferred (2026-07-09)

- **Current:** `^6.0.3`. **Available latest:** `7.0.2`.
- **Reason:** TypeScript 7 is a major release. Our toolchain still targets the
  6.x line — `ts-jest@^29.4.11`, `tsup@^8.5.1`, `ts-node@^10.9.2`, and
  `@biomejs/biome@^2.5.7` — and none are confirmed compatible with the TS7
  compiler/API. A blind bump risks breaking type-check, the Jest transform, and
  the build in one step, with a blast radius across the whole package.
- **Plan:** Cut a dedicated follow-up ticket to validate the toolchain against
  TS7 (upgrade `ts-jest`/`tsup`/`ts-node` first, then the compiler), and flag
  the PO. Not appropriate to bundle into recurring dependency maintenance.

### @types/node@^24.13.3 → ^26.1.1 — deferred (2026-07-20)

- **Current:** `@types/node@^24.13.3`. **Available latest:** `^26.1.1`.
- **Reason:** `@types/node` must track the runtime, not lead it. `engines.node`
  is `>=24.19.0 <25.0.0` and `.nvmrc` pins `24.19.0`, so the ambient Node types
  are intentionally held on the 24 line. A proposed upgrade to
  `@types/node@^26.1.1` was reverted because it would expose Node 26 APIs in
  TypeScript that are not available in the supported Node 24 runtime. This could
  allow code to compile successfully while failing at runtime and may mask
  compatibility issues. The Node type definitions must remain aligned with the
  project's supported Node version.
- **Plan:** Revisit only when the Node runtime itself moves off 24 (new
  `engines`/`.nvmrc` floor); bump `@types/node` to match in the same change.

### @changesets/cli@^2.31.0 → 3.0.0 — resolved (2026-08-26)

- **Upgraded to:** `@changesets/cli@^3.0.1` in previous update branch,
  `.github/workflows/publish.yml`'s `changesets/action@v1` → `@v2`, updated in the `2026-08-24`
  branch.
- **Follow-up verification performed:**
  - `publish.yml` already used the v2 kebab-case input names
    (`publish-script`, `github-token` as an explicit input, not the
    `GITHUB_TOKEN` env var) and OIDC/npm-provenance auth rather than
    `NPM_TOKEN`/`.npmrc` — all of which v2 requires — so no workflow changes
    were needed beyond the version bump itself.
  - `.changeset/config.json` uses no removed v3 options (no `prettier`,
    `commit`/`sinceMaster`/`updateChangelog`/`isPublic`/`skipCI` flags,
    `privatePackages`, or prerelease `pre.json` in use).
  - `npx changeset status` and `npx changeset --version` run cleanly against
    the resolved `3.0.1`.
  - No workflow references the CLI flags/inputs removed in v3/v2 (checked via
    repo-wide search).
- **Still worth watching:** `changeset version` now exits `1` (previously `0`)
  when there are no unreleased changesets. `changesets/action@v2` gates its
  internal call to `version` behind its own "has changesets" check, so this
  shouldn't surface in `publish.yml`'s normal push-to-`main` flow — but if the
  publish job ever starts failing specifically on merges with no pending
  changesets, this exit-code change is the first thing to check.

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
- **Why an override is still needed:** this advisory was originally reached
  through three independent chains; two have since resolved upstream and their
  overrides were dropped (`override cleanup` commit, 2026-09-08) — `npm audit`
  confirmed clean afterward:
  - `@oclif/core` (via `artillery`) used to pin `ejs@^3.1.10`; the installed
    `@oclif/core@4.14.0` now declares `ejs@^6` directly, already past the fix.
    The `ejs@^6.0.1` override was removed as redundant.
  - `jest`'s own `glob` dep used to be held back by a Node-version floor
    (`glob@11+` requiring Node `>=20`, jest 30 officially supporting Node
    `18.14.0+`). The installed `@jest/reporters@30.5.1`/`jest-config@30.5.1`
    now declare `glob@^13.0.6` directly. The `glob@^13.0.6` override was
    removed as redundant.
  - The remaining chain is still capped by each immediate parent's declared
    range: `jest` → `babel-plugin-istanbul@^8.0.0` (npm's `latest` dist-tag is
    still `8.0.0`; the fix landed in unpublicized patches `8.0.1`/`8.0.2`), and
    `babel-plugin-istanbul` → `test-exclude@^7.0.1` (still behind the fixed
    `8.0.0`).
  - `matcher-collection` (via `artillery`'s `walk-sync`) is unmaintained since
    2019 and still declares `minimatch@^3.0.2` with no newer release to wait
    for. Its one usage in `artillery` is the legacy AWS ECS/Fargate
    test-packaging path (`run-ecs`), which this repo's performance scripts
    never invoke. (We don't use AWS ECS or Fargate here.)
- **Verified (2026-07-29, full override set):** full unit suite (688/688
  passing), `npm run test:coverage` (istanbul instrumentation producing
  correct line/branch numbers), `tsc` clean, and `artillery
  --version`/`--help`/`run --help` (exercises oclif's `ejs.render()` help
  templating) all confirmed working post-override.
- **Verified (2026-09-08, after dropping `ejs`/`glob`):** `npm audit` reports 0
  vulnerabilities.
- **Revisit:** re-run the full verification (test suite, coverage, artillery
  CLI smoke test) whenever `jest`, `ts-jest`, or `artillery` are next bumped —
  the remaining overrides sit outside the range each parent package actually
  declares as compatible, so a future parent version could shift what's safe
  here.

### Accepted vulnerabilities

<!-- Format:
### <advisory-id> — <package>@<version> (<severity>)

- **Reason it can't be fixed now:** ...
- **Mitigation:** ...
- **Revisit:** <condition or date>
-->
