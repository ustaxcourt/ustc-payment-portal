```JS
{
  // Identifiers
  payGovTrackingId: string,      // Generated and provided by Pay.gov after transaction is complete (we can use it to debug issues)
  agencyTrackingId: string,       // Your internal tracking ID
  appId: string,                  // Which app (DAWSON, exam, etc.)

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
- What happens when a sale is stuck on pending? (and the token expires at the 3 hour mark)
- Who actually uses getDetails? (Finance department to debug transactions?)
- AgencyTrackingID decided by the client app or us?

