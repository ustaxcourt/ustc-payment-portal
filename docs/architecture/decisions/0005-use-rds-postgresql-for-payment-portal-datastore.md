# 5. Use RDS (PostgreSQL) for Payment Portal datastore

Date: 2026-02-09

## Status

Accepted

## Context

Payment Portal needs a database to store transaction information as it is received and processed, and information about applications that use the portal (e.g. DAWSON, Nonattorney exam). We need to support daily, weekly, monthly, and quarterly roll-up reports for finance auditing, metrics and trend analysis, and investigation of issues in conjunction with application logs. The application runs in AWS, and we want to keep the datastore within the AWS ecosystem.

We researched several options and documented trade-offs, cost estimates, and fit with our reporting and correctness requirements. This decision fulfills the story "Decide on datastore for Transactions" (PAY-038).

## Decision

We will use **Amazon RDS with PostgreSQL** as the primary datastore for Payment Portal. PostgreSQL is chosen for compatibility with DAWSON, SQL aggregation, and no licensing cost. We will use a db.t3.small instance with 20GB storage and 20GB backup. Multi-AZ is recommended for production for automatic failover; Single-AZ is acceptable for non-production. RDS Proxy can be added later if connection pooling is needed as concurrency grows.

We evaluated the following options:

- **DynamoDB** — Rejected. Good fit for serverless and low latency, but limited native aggregation (no SUM, COUNT, GROUP BY). Supporting our auditing dashboard would require streams to pre-aggregated tables, EMR, or S3 + Athena, adding complexity. Correctness rules (e.g. single payment confirmation, unique IDs) would also need to be enforced entirely in application logic.
- **DocumentDB** — Rejected. Limited aggregation compared to SQL and higher cost (~$446+/month).
- **Aurora Serverless v2** — Rejected. Provides the SQL and analytics we need with Multi-AZ and auto-scaling, but cost (~$180/month) is high for our expected scale. Aurora Serverless v1 is cheaper but reaches end-of-life in March 2026.
- **RDS** — Accepted. PostgreSQL gives us standard SQL aggregation for roll-up reports and trend analysis, ACID and relational integrity for payment correctness, and lower cost. Twenty GB storage provides room to grow. A future hot/cold strategy remains an option if we need long-term archival and analytics at scale.

Detailed analysis and cost tables are in [PAY-038 datastore options](../proposals/PAY-038-datastore-options/) (final recommendation, RDS Vanilla and S3 option, DynamoDB options, Aurora Serverless analysis).

## Consequences

- **Reporting and auditing**: Daily, weekly, monthly, and quarterly reports and ad-hoc analytics can be implemented with SQL queries against the transactional store, without additional ETL or analytics stores at launch.
- **Cost**: ~$4.40/month (Single-AZ) or ~$6.70/month (Multi-AZ) with reserved instances (plus one-time upfront ~$211–423); RDS Proxy adds ~$22/month if Lambda concurrency warrants connection pooling. Estimates are per AWS Pricing Calculator (reserved instances, 1-year term) as of 2026-02-09 and assume ~20k–100k writes per year (see [PAY-038 datastore options](../proposals/PAY-038-datastore-options/)).
- **Operations**: We will manage schema changes and instance sizing. Backup and encryption at rest are handled by RDS; we will use automated backups and consider Performance Insights / Enhanced Monitoring for troubleshooting.
- **PCI**: RDS supports encryption at rest, automated backups, and integration with CloudWatch and IAM. Specific PCI scope and controls should be confirmed with security/compliance; the chosen RDS configuration is consistent with common PCI-oriented patterns.

## References

- [Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS RDS Pricing](https://aws.amazon.com/rds/postgresql/pricing/)
