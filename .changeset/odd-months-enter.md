---
"@ustaxcourt/payment-portal": patch
---

PAY-270: Remove unused environment variables (`SUBDOMAIN`, `TCS_APP_ID`, `CERT_PASSPHRASE`) from `.env.example` and the README. Reframe the README to clarify that `.env` is for local development only — deployed environments get their configuration from Terraform (see [ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md)).

Drops the README's env-var table in favor of `.env.example` as the single source of truth for which variables exist; explanations for the conceptual env-layer flags (`APP_ENV`, `NODE_ENV`, `LOCAL_DEV`, `LOG_LEVEL`) move into README prose, and inline comments are added to `.env.example` for variables whose purpose isn't obvious from the name.

Also drops the dead `CERT_PASSPHRASE` field from the `ProcessEnv` type declaration in `src/types/environment.d.ts` and renames two misleading tests in `src/appContext.test.ts` (their names referenced `CERT_PASSPHRASE` but the actual code gate is `PRIVATE_KEY_SECRET_ID` + `CERTIFICATE_SECRET_ID`).

Note: the per-fee `tcsAppId` (camelCase) DB field used in ~20 files is unrelated to the removed `TCS_APP_ID` env var and is unaffected. The `CERT_PASSPHRASE_SECRET_ID` variable that drives stg/prod mTLS via AWS Secrets Manager is also unaffected.
