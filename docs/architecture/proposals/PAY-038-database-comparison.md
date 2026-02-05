# PAY-038: Database Options Analysis

## Aurora Serverless v2

### Architecture

```
Lambda (write) → Aurora Serverless v2 (all data)
                      ↓
              SQL queries (real-time + historical)
```

### Pros

- **Cost**: ACU-based pricing with a 0.5 ACU minimum (cannot scale to zero). At 100k
  transactions/year compute is the only meaningful cost — storage and I/O are negligible.
- **Operational simplicity**: Single data store, no archival pipeline, no ETL, unified query path.
- **Analytics fit**: SQL GROUP BY, window functions, and JOINs map directly to the required
  daily/weekly/monthly/quarterly roll-ups.
- **Data integrity**: ACID transactions and foreign key enforcement. No partial writes.
- **PCI posture**: Encryption at rest by default, automated backups with point-in-time recovery,
  CloudTrail + Enhanced Monitoring. Widely adopted in PCI environments.

### Cons

- **No scale-to-zero**: 0.5 ACU minimum per instance (~$90/mo baseline with Multi-AZ) even with zero traffic.
- **Schema migrations**: ALTER TABLE required for changes, though the transaction schema is expected
  to be stable.

### Schema

```sql
CREATE TABLE applications (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tcsAppId VARCHAR(50),
  contactEmail VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  payGovTrackingId VARCHAR(255) UNIQUE NOT NULL,
  agencyTrackingId VARCHAR(255) UNIQUE NOT NULL,
  appId VARCHAR(50) NOT NULL REFERENCES applications(id),
  amount DECIMAL(10, 2) NOT NULL,
  feeType VARCHAR(100) NOT NULL,
  transactionStatus ENUM('Success', 'Failed', 'Pending', 'Stuck-Pending') NOT NULL,
  initiatedAt TIMESTAMP NOT NULL,
  completedAt TIMESTAMP NULL,
  errorCode VARCHAR(50) NULL,
  errorMessage TEXT NULL,
  paymentMethod ENUM('ACH', 'Credit', 'PayPal') NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appId (appId),
  INDEX idx_status (transactionStatus),
  INDEX idx_initiatedAt (initiatedAt)
);
```

> **Note**: Aurora Serverless v1 will be outdated in MArch and v1 will be forced over to v2

### Cost Estimate (100k transactions/year)

**Total** | **~$180/month** |

---
