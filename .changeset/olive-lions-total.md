---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts `includeTotals=true`, which adds a `totals` block holding summed revenue for five fixed periods to date — day, week, month, fiscal quarter and fiscal year. Both the parameter and the field default off, so existing callers are unaffected.

Totals cover successful payments only and ignore `from`/`to` and `status`, so the figures hold steady while the user filters the log. Each period echoes the `from`/`to` it was summed over, resolved in `America/New_York`; weeks open on Sunday and the fiscal year opens on October 1.
