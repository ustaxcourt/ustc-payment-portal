---
"@ustaxcourt/payment-portal": minor
---

Add a metadata search filter to `GET /transaction-log`. `metadataKey` (one of `docketNumber`, `email`, `fullName`, `accessCode`) and `metadataValue` must be supplied together; rows are narrowed by a case-insensitive substring match on `metadata ->> metadataKey`. Like the other filters, it narrows `data` and `total` but leaves `counts` and `totals` untouched.
