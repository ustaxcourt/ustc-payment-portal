---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts `includeFeeBreakdown=true`, which adds a `feeBreakdown` array tallying successful payments per fee — count and summed amount — for the requested timeframe. Both the parameter and the field default off, so existing callers are unaffected.

The breakdown honours `from`/`to` but ignores the `status` filter, so the figures hold steady while the user filters the log. Every configured fee appears even with nothing collected, rows are ordered by subtotal descending, and on export requests the field follows the same first-page-only rule as `counts` and `totals`.
