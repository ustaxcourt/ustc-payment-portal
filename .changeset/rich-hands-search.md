---
"@ustaxcourt/payment-portal": minor
---

Add `GET /revenue-summary`: everything the dashboard's revenue totals table needs in one SigV4 call — summed revenue and per-fee tallies for the day, week, month, fiscal quarter, and fiscal year to date, plus year-over-year trends. Totals and tallies are computed in a single SQL statement, so a period's total always equals its summed fees; `yoyTrends` is omitted when prior-year totals cannot be computed. The endpoint takes no query parameters by design and replaces the dashboard composing `includeTotals` and five per-period `includeFeeBreakdown` calls on `/transaction-log`.
