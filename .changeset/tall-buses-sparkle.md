---
"@ustaxcourt/payment-portal": minor
---

Add timeframe query support for dashboard transaction retrieval.

- `GET /transactions` now accepts `from`, `to`, `status`, `page`, and `pageSize` query parameters. When a timeframe is supplied, the endpoint returns the paginated transaction log and aggregate counts for that range; without query parameters it preserves the legacy "recent transactions" response.
- Dashboard timeframe filters now accept inclusive `MM/DD/YYYY` date inputs and normalize them to Court-local day bounds. The direct `GET /transaction-log` handler also accepts the same date format alongside ISO datetimes.
