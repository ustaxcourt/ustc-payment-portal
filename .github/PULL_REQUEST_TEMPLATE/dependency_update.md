# {Issue Number}: Dependency updates
<!--
  Written by the dev. If this PR is tied to a ticket, use its number and title.
  Otherwise use a short descriptive title (e.g. "Q3 dependency rotation").

  This template is for manual, human-driven dependency bumps (a batch rotation, a
  security advisory, or a version bump needed to unblock other work) — not automated
  Dependabot PRs, which don't go through this flow.
-->

## Summary
<!--
  2–5 sentences. Why these packages, why now (routine rotation, a specific CVE/advisory,
  or unblocking another change)? Save package-by-package detail for the tables below.
-->

## Dependencies Updated

For each runtime package (or group of related packages), document **affected application areas in plain language** under "Possible areas of testing" so reviewers know what to exercise. Prefer workflows over file paths — for example:

- [ ] initiating a payment (`POST /init`)
- [ ] processing a payment (`POST /process`)
- [ ] retrieving payment/transaction details (`GET /details`)
- [ ] client authorization (`authorizeClient`, `/validate-client`)
- [ ] dashboard read endpoints (CORS-scoped GETs)
- [ ] local dev stack startup (`npm run start:all`, mock Pay.gov Test Server OR (`npm run start:dev-server` and `npm run start:pay-gov-test-server`))
- [ ] database migrations (`npm run migrate:latest`)
- [ ] Lambda deploy artifact (`npm run build:lambda`)

**Mandatory manual testing:** automated CI alone is not sufficient for a dependency rotation. After pushing this branch (which gets its own ephemeral dev environment via `CICD - Dev`, unless authored by `dependabot[bot]`), manually exercise the application areas listed above — both locally and in that environment.

### Runtime dependencies

<!-- Packages under `@aws-sdk` are optional to list individually for brevity — group them as `@aws-sdk/*` with a combined purpose if several bumped together. -->

| Package | Version | Purpose | Used in | Possible areas of testing |
|---|---:|---|---|---|
| | | | | |

### Development dependencies

Verification of these is usually covered by CI (`npm run lint`, `npm run tsc`, `npm test`). Call out manual checks only when a tool change can affect local workflows (e.g. the local stack's Docker/Postgres setup, Jest config, ts-node).

| Package | Version | Purpose | Used in |
|---|---:|---|---|
| | | | |

### Dependencies checklist

- [ ] I have listed the updated packages, their purpose, where they're used, and the plain-language application areas to test (`@aws-sdk/*` packages are optional to list individually).
- [ ] **Mandatory manual testing:** I have exercised the affected application areas listed above:
  - [ ] Locally (`npm run start:all` OR `npm run start:dev-server` and `npm run start:pay-gov-test-server`)
  - [ ] Hit `/init` locally to confirm Dev server still functions.
  - [ ] In this PR's ephemeral dev environment
- [ ] Confirm that all integration tests pass in this PR.
- [ ] I have run `npm audit --audit-level=high` and resolved or consciously accepted any findings.
- [ ] `package-lock.json` reflects a clean `npm ci` install — no hand edits.
- [ ] If a security advisory motivated this update, I've named the CVE/advisory above.
- [ ] I have updated Terraform Providers in our IaC code, and confirmed that Terraform plan succeeds on the PR.
- [ ] Any deferred updates have been listed in `dependency-caveats.md`
- [ ] I have included a changeset file covering the dependency updates.
- [ ] I have reviewed CHANGELOG.md / release notes for any breaking changes in the updated packages and reflected them in the tables above.

---

## Testing
<!--
  Note any test files that changed as a result of the bump (snapshot updates, mock
  signature changes, etc). If none did, say so — coverage for this PR is the manual
  testing above plus the existing suite passing unmodified.
-->

## Out of Scope / Follow-up Tickets
<!--
  Anything intentionally deferred, e.g. a major version bump held back for a breaking-change migration.
  Format: "Short description — PAY-### (This looks wrong in VS Code markdown, but will format correctly to a checkbox in GitHub PR Summary)"
  Delete this section if there is nothing to note.

  IMPORTANT: Follow-up tickets need to exist in JIRA before they're listed here.
  Confirm with the team if a follow-up ticket should exist.
-->

- Short description - **PAY-###**
