# RDS Vanilla

The standard Relation Database pattern, deployed via a EC2 instance managed by AWS.

## Recommended SQL Language

PostgreSQL is recommended, it's open source so we don't have to pay any additional fees and includes a FILTER clause for data aggregiation. It's also supported by Aurora Serverless, should we ever get to the point where we need to scale up our data store. (DAWSON also currently uses it, so it has the best cross-team compatiblity shoulod we ever change engineers)

## Base Constraints

- As a starting point, we are assuming **20,000** writes per year as a minimum starting point. This is from the 2025 data on petitioner filing fees paid to DAWSON. With the design assumption that we want to support multiple USTC apps, we are also assuming a soft ceiling of **100,000** writes per year.
- The ability to generate transaction reports is needed, at the daily, monthly, and year to multi-year scale for finance auditing purposes.
- Assumes a max of 100 DB read/writes per day

## Configuration

**Important: Things like instance size we might need to tweak over time (adjusting up or down) to fit our actual traffic**

- Multi-AZ is recommended (for Prod) for automatic failover protection. A copy of the DB is kept in another data center in the same region that can be automatically switched over to in case of hardware failure, data center outage, abd DB patching. We can get away with Single-AZ for dev and testing.
- db.t3.small
- 20GB Storage, 20GB backup
- 100% Utilization

### RDS Proxy

Connecting pooling, sits between Lambda and RDS to manage DB connections. Useful if we end up with multiple concurrent lambda functions trying to connect to the DB at the same time.

### CloudWatch Database Insights (Enhanced Monitoring)

- Real-time OS metrics (CPU, memory, disk I/O, processes) at 1-60 second granularity. (for context, cloudwatch gives us by the minute and above)
- We can enable it later for troubleshooting performance with the DB.

### RDS Performance Insights

DB performance monitoring, can show which queries are slow, wait events, load analysis. It won't be as useful right out of the gate, but we can use it for query optimization later. (7 day retention - free tier for now)

### Backup Storage

Automated daily backups + transaction logs for point-in-time recovery

- Match size of DB Storage
- 1-2 week retention

### Snapshot Export

More relevant for RDS + S3 option. We can skip it with vanilla RDS.

## Estimates

### 20 GB Storage, 20GB Backup, db.t3.small, 100% Usage, GP3

**Total would be Upfront + (Monthly \* 12), paying more upfront means a smaller monthly cost**
| Configuration | RDS Proxy | Monthly | Total Upfront |
|---------------|-----------|---------|---------------|
| Multi-AZ | No | $6.70 | $423 |
| Single-AZ | No | $4.40 | $211 |
| Multi-AZ | Yes | $28.60 | $423 |
| Single-AZ | Yes | $26.30 | $211 |

**Adding Proxy RDS is an extra $22 a month**

## Important Considerations

If we need to go over the reserved instance, we get charged their ondemand pricing.

# S3 + Athena (we add this on for hot/cold storage strategy)

Periodic lambda runs covert transactions older than the hot period over to s3 standard, with lifecycle policies migrating them over to S3 IA and S3 Glacier Instant Retrieval as needed.

## Architecture Overview

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│     RDS     │────>│  Lambda         │────>│     S3      │
│   (Hot)     │     │  (Scheduled)    │     │   (Cold)    │
│  0-90 days  │     │                 │     │   90+ days  │
└─────────────┘     └─────────────────┘     └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │   Athena    │
                                            │  (Queries)  │
                                            └─────────────┘
```

# Hot/Cold

| Storage       | Data Age  | Use Case                       | Query Speed       |
| ------------- | --------- | ------------------------------ | ----------------- |
| **RDS (Hot)** | 0-90 days | Operational queries, debugging | Fast (~ms)        |
| **S3 (Cold)** | 90+ days  | Multi-year finance audits      | Slower (~seconds) |

### Data Flow

**This is overkill for an estimated 100,000 db read/writes a year, but minimizes our storage costs with scale in the long term**

1. **Day 0:** Transaction written to RDS
2. **Day 90:** Scheduled Lambda archives old records to S3 (Parquet format)
3. **Day 90+:** Data queryable via Athena
4. **12 months** Migrate records from S3 Standard to S3 Standard IA
5. **24 months+** Migrate records for S3 Standard IA to S3 Glacier Instant Retrieval
6. **Optional:** Delete archived records from RDS to save storage
7. **Optional:** Migrate records to S3 Glacier Deep Archive if we find a good long term pont where we want to keep records, but don't except them to be accessed more than rarely. Note that this S3 level requires a 12-48 Hour waiting period to restore records at this level to s3 Standard, where we can read them via Athena.

```
{
  "Rules": [
    {
      "ID": "Payment Portal Archive Lifecycle",
      "Status": "Enabled",
      "Filter": { "Prefix": "transactions/" },
      "Transitions": [
        {
          "Days": 365,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 730,
          "StorageClass": "GLACIER_IR"
        }
      ]
    }
  ]
}
```

## Pricing

For S3 Standard, assuming 1000 GET/SELECT, 5000 PUT/COPY/POST, and 1GB of storage, it's **0.05$** per month. So about **$0.60** a year.

## Conclusion

For now, I think we can skip the hot/cold strategy with S3 until we have enough traffic to make it viable. If we do it now, it's extra effort for only 5 cents a month.
