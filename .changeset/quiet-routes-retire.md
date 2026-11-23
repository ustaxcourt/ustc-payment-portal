---
"@ustaxcourt/payment-portal": patch
---

Remove the unused `GET /transactions`, `GET /transactions/{paymentStatus}` and `GET /transaction-payment-status` endpoints.

- Drop their API Gateway resources, Lambda functions and public resource-policy statement from Terraform, along with the `enable_public_dashboard` variable.
- Remove their dev server routes, handlers, use cases, schemas and OpenAPI entries, and the `getAllTransactionsHandler`, `getTransactionsByStatusHandler` and `getTransactionPaymentStatusHandler` package exports.
- Remove the `TransactionModel.getAll`, `getByPaymentStatus` and `getAggregatedPaymentStatus` methods that only served them.
- Point the staging unsigned-access smoke test at `/transaction-log`.
- Documentation updates to reflect removing the 3 unused endpoints.
