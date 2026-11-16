---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts `sort` and `order`, so the dashboard can order the log by any column it displays. `sort` is a closed list of the ten displayed columns and `order` is `asc`/`desc`; both default to the previous behaviour — `lastUpdatedAt` descending — so existing callers are unaffected.

Fee type and payment method order by the label the response returns rather than the value stored in the column: `paypal` sorts before `plastic_card`, but "Credit/Debit Card" sorts before "PayPal". Rows with no value for the sorted column are listed last in both directions, and every ordering is broken by the primary key so results are stable across identical requests. The response echoes the resolved `sort` and `order` alongside the existing `from`/`to`/`page`/`pageSize`.
