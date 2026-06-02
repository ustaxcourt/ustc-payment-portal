---
"@ustaxcourt/payment-portal": patch
---

Converts console logs and errors in initPayment to Pino log statements per PAY-249, and updates `safeUpdateToFailed()` to log a pino error if the DB update fails.
