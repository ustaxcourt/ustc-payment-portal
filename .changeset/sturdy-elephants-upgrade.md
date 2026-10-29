---
"@ustaxcourt/payment-portal": minor
---

Upgrade the local dev Postgres container from `postgres:14` to `postgres:17` to match the RDS upgrade. Postgres 17 cannot start on Postgres 14 data, so the consumer stack now uses a new named volume (`payment_portal_dev_db_pg17`) and starts with an empty database; migrations and seeds run on first start. The old `payment_portal_dev_db` volume is no longer used and can be removed with `docker volume rm`.
