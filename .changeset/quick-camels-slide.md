---
"@ustaxcourt/payment-portal": patch
---

PAY-309: InitPayment now validates the Pay.gov `startOnlineCollection` response with a Zod schema and handles `S:Fault` envelopes via a dedicated `handleFault`, so malformed payloads and vendor faults fail fast with diagnostic logging instead of silently corrupting the transaction record.
