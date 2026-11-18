---
"@ustaxcourt/payment-portal": patch
---

- Reconcile stale processing transactions with Pay.gov before marking them failed, updating completed payments from Pay.gov and returning the correct payment status for recovered transactions.
- Improve stale payment recovery by verifying transaction status with Pay.gov, preventing completed payments from being incorrectly failed, and returning the correct payment result after reconciliation.
