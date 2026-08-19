---
"@ustaxcourt/payment-portal": minor
---

Add an export mode to `GET /transaction-log`. Passing `export=true` raises the `pageSize` ceiling from 200 to 5000 so file exports can walk the timeframe in few requests, and on export pages after the first the response omits `counts` and `total` (the caller already has them from page 1), skipping both COUNT queries. Non-export requests are unchanged; `pageSize` above 200 without the flag is rejected with a 400.
