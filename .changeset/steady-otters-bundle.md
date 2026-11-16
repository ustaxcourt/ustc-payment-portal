---
"@ustaxcourt/payment-portal": patch
---

Upgrade `objection` from 3.1.5 to 4.4.3 (PAY-506).

- objection 4 is ESM-only. The package build now bundles it, along with the
  also ESM-only `node-fetch`, into `dist/`. Consumers whose Jest tests import
  this package no longer fail with "Must use import to load ES Module".
- No public API or type changes. ORM behavior, including `claimForProcessing`,
  is pinned by a new `TransactionModel` integration test that passes unedited on
  both versions.
- See `docs/dependency-caveats.md` for the fork review and the Jest, Lambda,
  and tsup workarounds.
