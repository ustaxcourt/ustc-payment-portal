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
  `@biomejs/biome@^2.5.3` — and none are confirmed compatible with the TS7
  compiler/API. A blind bump risks breaking type-check, the Jest transform, and
  the build in one step, with a blast radius across the whole package.
- **Plan:** Cut a dedicated follow-up ticket to validate the toolchain against
  TS7 (upgrade `ts-jest`/`tsup`/`ts-node` first, then the compiler), and flag
  the PO. Not appropriate to bundle into recurring dependency maintenance.

### @types/node@^24.13.3 → ^26.1.1 — deferred (2026-07-20)

- **Current:** `@types/node@^24.13.3`. **Available latest:** `^26.1.1`.
- **Reason:** `@types/node` must track the runtime, not lead it. `engines.node`
  is `>=24.12.0 <25.0.0` and `.nvmrc` pins `24.18.0`, so the ambient Node types
  are intentionally held on the 24 line. A proposed upgrade to
  `@types/node@^26.1.1` was reverted because it would expose Node 26 APIs in
  TypeScript that are not available in the supported Node 24 runtime. This could
  allow code to compile successfully while failing at runtime and may mask
  compatibility issues. The Node type definitions must remain aligned with the
  project's supported Node version.
- **Plan:** Revisit only when the Node runtime itself moves off 24 (new
  `engines`/`.nvmrc` floor); bump `@types/node` to match in the same change.

<!-- Format:
### <package> <current> → <available> — deferred (<date>)

- **Current:** `<version/range>`. **Available latest:** `<version>`.
- **Reason:** ...
- **Plan:** ... (link a follow-up ticket if one is cut; flag the PO if pursued)
-->

---

## Accepted vulnerabilities

### GHSA-395f-4hp3-45gv — shell-quote (<1.8.5) (high) — accepted (2026-07-20)

- **Reason it can't be fixed now:** The vulnerability is introduced through a
  transitive dependency and resolving it may require dependency upgrades outside
  the scope of this PR.
- **Mitigation:** The affected package is used in development tooling only.
  Continue using trusted inputs and monitor dependency updates. Apply
  `npm audit fix` or upgrade dependent packages when a compatible version becomes
  available.
- **Revisit:** During the next dependency update cycle or when the upstream
  dependency chain provides a version that resolves the vulnerable
  `shell-quote` dependency.

<!-- Format:
### <advisory-id> — <package>@<version> (<severity>)

- **Reason it can't be fixed now:** ...
- **Mitigation:** ...
- **Revisit:** <condition or date>
-->
