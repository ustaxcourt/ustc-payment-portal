---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts two new filters: `transactionStatus` (one of the six transaction attempt statuses) and `clientName` (a case-insensitive partial match). Both are optional and additive to the existing `status`, `fee`, and `paymentMethod` filters.
