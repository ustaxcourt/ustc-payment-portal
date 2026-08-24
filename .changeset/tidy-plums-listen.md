---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts new optional additive `fee`, `paymentMethod`, and `transactionStatus` filters, alongside the existing `status` filter. None of these filters narrow the response's `counts` or `totals` — those aggregates only ever reflect the requested timeframe, same as before.
