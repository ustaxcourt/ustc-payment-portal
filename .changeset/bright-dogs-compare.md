---
"@ustaxcourt/payment-portal": patch
---

Fix a CloudWatch-reported logging crash in `processPayment` by avoiding logging a non-serializable request class instance. The affected log entries now emit safe scalar fields only, which keeps the logger's structured-clone sanitization from failing at runtime.
