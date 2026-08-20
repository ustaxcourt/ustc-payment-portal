---
"@ustaxcourt/payment-portal": minor
---

Add timeframe query support for dashboard transaction retrieval.

- `GET /transaction-log` now accepts dashboard timeframe filters using inclusive `MM/DD/YYYY` dates, plus status and pagination controls, and returns aggregate counts for the requested range.
- Dashboard timeframe inputs are normalized to Court-local day bounds. The transaction-log API also continues to accept ISO datetimes, now requiring an explicit timezone offset.
