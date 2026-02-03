```JS
{
  // Identifiers
  payGovTrackingId: string,      // Generated and provided by Pay.gov after transaction is complete (we can use it to debug issues)
  agencyTrackingId: string,       // Your internal tracking ID
  appId: string,                  // Which app (DAWSON, exam, etc.) - tcsAppId

  // Transaction Details
  amount: number,                 // Payment amount
  // We should make this an enum for consistentency
  feeType: string,         // Human-readable fee name
  // Success, Failed, Pending, Cancelled
  // Where is the transaction in the process?
  // Do we want the names to match the props coming from pay.gov's response?
  transactionStatus: string,

  // Timestamps
  initiatedAt: string,            // ISO 8601 timestamp
  completedAt: string | null,     // When finished/failed

  // Failure Info (if applicable)
  errorCode?: string | null,
  errorMessage?: string | null,
}
```

## Caveats

### Important
  - Can we avoid having the client needing to track the PayGovTrackingID
  - Make Agency Tracking ID AppID+FeeName+keyNumber

- What happens when a sale is stuck on pending? (and the token expires at the 3 hour mark)
- Who actually uses getDetails? (Finance department to debug transactions?)
- AgencyTrackingID decided by the client app or us?
- Do we want a `stuck-pending` status?

## Agency Tracking ID Naming
- Pattern for how we want to build the id? (we generate it)
  - Something like DOCNUM-FEENAME-UNIQEND

## tcsAppID
- Will it be the same as just App ID?
- 80% sure that tcsAppID is unique to each client appID using + fee type (one tcsAppId per fee type)
  - Mike is going to double check a planned meeting with Pay.gov people to find out.

## feeType
- Make it enum or constant
- What are the specific fees we are covering?
  - Non-attorney admissions exam Fee
  - Petition Fee - $60 USD
  - Copy Fee - variable fee (post MVP) - TBD

## Transaction Status
- What our the 'status' names?
  - Success
  - Fail
  - Pending (ACH ONLY) - takes a day or 2 to process

## Payment Options
- ACH/eChecking
- Credit through Pay.gov
   - Processed almost immediately
- PayPal Redirect
  - Processed almost immediately

## Questions for Mike
- Is testCert endpoint actually getting used, or does it just exist for testing purposes internally.
  - Tests our Pay.gov cert (it's a health check)
    - Passes if cert is valid, fails if not
- Add it as health check?
  - Skip drawio diagram for it for now.

# Datastore Options

## Constraints
- Assume minimum of 20,000 transactions for petition fees
- Soft Ceiling: 100,000 transactions to start?
- We need to be able to do queries for historical transactions from daily, monthly, quarterly, and multi-yearly and etc per Chris for finance audits


- RDS Vanilla (Ben)
- RDS (Hot) -> Lambda (scheduled) -> S3 (Parquet files) -> Athena (Ben)
- DynamoDB Vanilla (Jean)
- DynamoDB + S3 Archival + Athena (DynamoDB is hot storage and S3 Archival is cold) (Jean)
- Aurora Serverless + S3 Archival (Anthony)
- Document DB Serverless (Anthony)


# Additional Endpoints needed?
- For later, what endpoints are needed to make our dashboard users happy?
