---
"@ustaxcourt/payment-portal": minor
---

Expand `GET /transaction-log` with fee, payment method, and transaction status filters, plus fixed-period revenue totals and year-over-year trend data when `includeTotals=true`. The totals and trend figures remain stable while row-level filters are applied, and the response/OpenAPI docs now describe the added `yoyTrends` payload.

Harden dummy transaction seeding by validating `SEED_START_DATE`, supporting historical seed ranges without rewriting production fee activation dates, and documenting the current seed controls.
