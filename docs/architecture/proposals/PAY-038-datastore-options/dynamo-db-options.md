## DynamoDB

### What is DynamoDB?
Amazon DynamoDB is a fully managed, serverless, key-value and document database designed for high-scale, low-latency, single-record workloads where access patterns are known in advance and data items are largely independent.

---

### Why Dynamo is initially attractive for PP?

At first glance, DynamoDB appears well-suited because:

#### PP is serverless (Lambda)
Payment Portal is built on AWS Lambda, so the system is designed to be stateless and scale out easily as traffic changes. DynamoDB fits naturally into this model since it does not require managing database connections, pooling, or long-lived sessions, all of which can be challenging in a serverless environment. Each Lambda invocation can interact with DynamoDB independently and safely without worrying about shared resources. For a fully serverless architecture, this makes DynamoDB an appealing early on.

#### Low latency
Payment Portal includes user-facing interactions like starting a payment and redirecting users to pay.gov, where slow responses are immediately noticeable. DynamoDB delivers consistently low-latency reads and writes without the overhead of managing database connections or locks. Since most operations are simple, key-based lookups or updates, performance stays predictable even when traffic briefly spikes.

#### Availability must be high
Payments need to be available at all times to avoid blocking users or leaving transactions in an unclear state. DynamoDB is built for high availability out of the box, with automatic multi-AZ replication and no manual failover to manage. This removes a lot of operational complexity compared to traditional databases that require explicit failover handling. From a reliability standpoint, DynamoDB provides strong guarantees with minimal operational overhead, which is appealing for PP.

DynamoDB also provides automatic scaling, multi-AZ durability, encryption, and IAM controls.

---

### Where Dynamo is not ideal

#### Payments must enforce correctness on its own. No native relational integrity
Payment systems rely on a few important rules, like making sure a payment is only marked paid once, tracking IDs stay unique, and statuses move forward in a predictable way. DynamoDB doesn’t enforce these rules on its own, so they need to be handled carefully in application logic. In a system with retries, background polling, and concurrent updates, this adds a bit more complexity compared to databases that enforce these guarantees automatically.

With DynamoDB, correctness is primarily managed in the code rather than the database. That means developers need to be deliberate about conditional updates, state checks, and edge cases. This isn’t a blocker, but it does require ongoing discipline and testing to ensure the system remains correct as it evolves, especially compared to SQL databases where some of these safeguards are built in.

---

#### Ad-hoc querying, analytics, and reporting limitations
DynamoDB is not designed to support flexible or exploratory queries. Data can only be accessed through predefined patterns such as the partition key, sort key, or explicitly defined secondary indexes. As a result, common questions like grouping payments by fee type and month, filtering failed payments above a certain amount, or viewing payments by status and application are difficult to answer unless those access patterns were planned in advance. Each new reporting question often requires adding a new index, performing an inefficient table scan, or exporting data to another system. Because reporting needs tend to evolve over time, this limitation makes DynamoDB less adaptable as new questions come up.

Questions where Dynamo will struggle:
- “Find payments with err code 4XX”
- “Filter by feeType”

---

#### Analytics, aggregations, and reporting
DynamoDB does not provide native support for analytical operations such as grouping, aggregation, or time-based analysis. There is no built-in ability to perform operations like `GROUP BY`, `SUM`, or `COUNT`, which are commonly needed for financial reporting and trend analysis. As a result, use cases such as monthly finance reports, reconciliation summaries, trend tracking, and SLA metrics cannot be handled directly within DynamoDB. These needs are typically addressed by exporting data to systems like S3 and querying it with Athena, which adds an additional layer of infrastructure. In practice, this means DynamoDB functions well as a transactional datastore, but analytics and reporting must live elsewhere.

Questions where Dynamo will struggle:
- “Average settlement time for ACH”

---

### S3 + Athena as mitigation
These gaps can be addressed by exporting data from DynamoDB to S3 and using Athena for reporting and analysis. This setup makes it possible to run flexible, SQL-style queries, handle aggregations, and support long-term retention and audit needs. The tradeoff is that it adds more moving parts to the system, such as data pipelines, partitioning, and managing consistency between the transactional data in DynamoDB and the analytical data in S3. While this approach works well, it does introduce additional complexity compared to having reporting and analytics handled directly within the primary database.

---

### Conclusion
DynamoDB initially looks like a strong fit for Payment Portal due to its serverless nature, low latency, and high availability, which align well with a Lambda-based, event-driven architecture. It works well for simple, single-record transactional access and keeps operational overhead low.

That said, Payment Portal is a correctness-critical system with evolving reporting and reconciliation needs. DynamoDB does not enforce key payment rules at the database level and has limited support for ad-hoc queries and analytics. While exporting data to S3 and using Athena can address these gaps, it introduces additional complexity. As a result, DynamoDB represents a tradeoff: operational simplicity and scalability at the cost of stronger built-in correctness guarantees and easier reporting.
