---
"@ustaxcourt/payment-portal": minor
---

`GET /transaction-log` accepts `includeTotals`, so the dashboard can display revenue above the log without paging the whole table to add it up. Passing `includeTotals=true` adds a `totals` block holding a summed amount for five fixed periods — day, week, month, quarter and fiscal year, each to date. Both the parameter and the response field default off, so existing callers are unaffected.

Totals cover successful payments only, and deliberately ignore `from`/`to` and `status`: they are fixed periods rather than the requested timeframe, so the figures hold steady while the user filters and sorts the log. Each period echoes the `from`/`to` it was summed over for the caller to display, resolved in `America/New_York` as a half-open range that closes at the moment of the request rather than at the end of the period. Weeks open on Sunday; the quarter and year are fiscal, so the year — and fiscal Q1 — opens on October 1. The sum runs in Postgres in the same round trip for all five periods, which is what keeps it correct past the 200-row page cap.
