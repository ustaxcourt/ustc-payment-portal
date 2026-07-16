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

### @types/node 24.13.3 → 26.1.1 — deferred (2026-07-09)

- **Current:** `^24.13.3`. **Available latest:** `26.1.1`.
- **Reason:** `@types/node` must track the runtime, not lead it. `engines.node`
  is `>=24.12.0 <25.0.0` and `.nvmrc` pins `24.18.0`, so the ambient Node types
  are intentionally held on the 24 line. Jumping to 26.x would type against APIs
  our Lambda/runtime doesn't provide and could mask incompatibilities. We took
  the in-range patch (24.13.2 → 24.13.3) and stopped there.
- **Plan:** Revisit only when the Node runtime itself moves off 24 (new
  `engines`/`.nvmrc` floor); bump `@types/node` to match in the same change.

### hashicorp/aws provider 5.100.0 → 6.x — deferred (2026-07-09)

- **Current:** `~> 5.0` (locked `5.100.0`, the newest 5.x). **Available latest:** `6.x`.
- **Reason:** The AWS provider 6.x is a major release with breaking changes
  (removed/renamed attributes, altered defaults) that touch every module —
  networking, RDS, RDS proxy, IAM, API Gateway, Lambda, monitoring. Upgrading
  under recurring maintenance risks unreviewed resource diffs across dev/stg and
  the dedicated prod account. `5.100.0` is the newest 5.x and carries no
  outstanding advisories, so there is no security pressure to move now.
- **Plan:** Cut a dedicated follow-up ticket to migrate to aws provider 6.x
  (read the upgrade guide, bump `~> 6.0` per module, review `terraform plan` in
  every environment), and flag the PO. Not appropriate to bundle here.

### OpenAPI spec 3.1.0 → 3.2 — deferred (2026-07-16)

- **Current:** generated spec pins `openapi: "3.1.0"` via `OpenApiGeneratorV31`
  ([`src/openapi/registry.ts`](../src/openapi/registry.ts)). **Available:** the
  `@asteasolutions/zod-to-openapi` 9.0.0 bump added `OpenApiGeneratorV32`
  (additive OpenAPI 3.2 support).
- **Reason:** The 9.0.0 upgrade was intentionally scoped to keep the generated
  spec unchanged — no consumer-visible diff. Moving to 3.2 means switching the
  generator, regenerating the spec (`npm run generate:openapi`), and validating
  that every downstream client and tooling step (mock server, integration
  tests, published types) still accepts a 3.2 document. That is a behavioral
  change, not routine dependency maintenance.
- **Plan:** Cut a dedicated follow-up ticket to evaluate the 3.1 → 3.2 bump
  (swap to `OpenApiGeneratorV32`, regenerate, verify downstream consumers), and
  flag the PO. Not appropriate to bundle into the recurring dependency update.

<!-- Format:
### <package> <current> → <available> — deferred (<date>)

- **Current:** `<version/range>`. **Available latest:** `<version>`.
- **Reason:** ...
- **Plan:** ... (link a follow-up ticket if one is cut; flag the PO if pursued)
-->

---

## Accepted vulnerabilities

_None yet._

<!-- Format:
### <advisory-id> — <package>@<version> (<severity>)

- **Reason it can't be fixed now:** ...
- **Mitigation:** ...
- **Revisit:** <condition or date>
-->
