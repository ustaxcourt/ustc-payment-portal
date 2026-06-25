---
"@ustaxcourt/payment-portal": minor
---

Add an AWS RDS Proxy in front of the Postgres database so Lambda connections are pooled and multiplexed across concurrent invocations, preventing connection exhaustion on the small instance under load. Payment and dashboard Lambdas connect through the proxy in dev/staging/production (the migration runner and ephemeral PR environments stay on direct connections by design). The connection cap is a single configurable value per environment (`proxy_max_connections_percent`).

Lambdas now trust both Node's built-in public CAs and the RDS CA bundle so they can validate the proxy's TLS certificate (public Amazon CA) as well as direct RDS connections (private RDS CA), and use a single connection per container now that the proxy owns pooling.
