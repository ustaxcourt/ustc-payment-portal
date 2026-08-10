---
"@ustaxcourt/payment-portal": patch
---

Return HTTP 410 Gone from `POST /process` when a Pay.gov payment token has exceeded its 3-hour TTL, directing the client to retry `POST /init` with the same `transactionReferenceId` to mint a fresh token.

- Add a token-age check to `TransactionModel.claimForProcessing` (`MAX_TOKEN_AGE_MS`, now shared via `src/config/constants.ts` and also used by `initPayment`), applied uniformly to both an unclaimed `initiated` token and a reclaimed stale `processing` token — but never to an actively in-flight `processing` claim, which still returns 409 Conflict.
- Document the new 410 cause on `POST /process` in the OpenAPI spec.
