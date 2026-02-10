# Final Recommendation

After considering DynamoDB, Document DB, Aurora Serverless, RDS, as well as hot/cold through s3 we recommend going with **RDS** for our Payment Portal data store.

## Why DynamoDB doesn't work for our needs?

Serverless DynamoDB lets us keep things cheap with our low traffic, however DynamoDB has limited aggregation options not making it ideal for our auditing dashboard. To do the equivalent of things like SUM(), AVG(), COUNT(), GROUP BY, we would need to set up a stream to a separate pre-aggregated table (essentially pre-planning the data we want to show in the dashboard, making it hard to tweak things with just SQL on payment portal), do an [Elastic Map-Reduce](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EMRforDynamoDB.html), and/or an S3 + Athena setup to open us up to be able to aggregate.

See [additional DynamoDB options analysis](./dynamo-db-options.md) for deeper exploration of the trade-offs we considered.

## Why DocumentDB doesn't work

DocumentDB has limited aggregation capabilities compared to SQL databases, making it less ideal for our auditing dashboard. It was also too expensive at $446+ a month.

## Why Aurora Serverless doesn't work

Aurora Serverless v2 with PostgreSQL gives us the SQL support we need, with Multi-AZ included and auto scaling, its just too expensive at $180 a month for the relatively small scale we are expecting with our data. v1 Aurora Serverless is cheaper, but is reaching EOL in March 2026, where AWS will just upgrade us to v2 anyway.

See [Aurora Serverless Analysis](./aurora-serverless.md) for our in-depth analysis.

## Recommend: Vanilla RDS

See [RDS Vanilla and S3 Options](./rds-vanilla-and-s3-option.md)

RDS gives us aggregate commands for SQL, is relatively cheap to run on db.t3.small, and gives 20GB of storage by default to give us plenty of room to grow into.

### 20 GB Storage, 20GB Backup, db.t3.small, 100% Usage, GP3

**Total is Upfront + (Monthly \* 12), paying more upfront means a smaller monthly cost**
| Configuration | RDS Proxy | Monthly | Total Upfront | Total (Year 1) |
|---------------|-----------|---------|---------------|----------------|
| Multi-AZ | No | $6.70 | $423 | $503.40 |
| Single-AZ | No | $4.40 | $211 | $263.80 |
| Multi-AZ | Yes | $28.60 | $423 | $766.20 |
| Single-AZ | Yes | $26.30 | $211 | $526.60 |

**Adding Proxy RDS is an extra $22 a month**

## Important Considerations

If we need to go over the reserved instance, we get charged their ondemand pricing.
