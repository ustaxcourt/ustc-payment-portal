---
"@ustaxcourt/payment-portal": patch
---

Fix the `/health` deploy gate, which has failed on every real Dev deploy since it was introduced, blocking auto-tagging and promotion to Staging.

- `secrets` check no longer requires an mTLS agent in environments that don't use one. Dev's `SOAP_URL` points at the mock `ustc-pay-gov-test-server`, which authenticates via a bearer token instead of a client cert, so the requirement is now gated by an explicit allowlist of mTLS-optional environments (`dev`, `local`); Stg, Prod, and any unrecognized `APP_ENV` still fail closed and require a working mTLS agent.
- `payGov` check now sends the same bearer auth headers the mock test server requires on every request, including the WSDL fetch; previously it sent none, so the probe always got rejected in Dev.
- Extracted the Pay.gov bearer-token header logic into a shared `getPayGovAuthHeaders` helper, replacing three near-duplicate copies across `appContext.ts`'s `postHttpRequest`, `testCert.ts`, and the healthCheck's WSDL probe.
