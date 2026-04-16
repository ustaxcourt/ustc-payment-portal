---
"@ustaxcourt/payment-portal": patch
---


### Database
Added `TransactionModel.findByPaygovToken(token)` — a static query method that looks up a transaction by `paygovToken` and returns `undefined` if none exists.

### processPayment Use Case
`processPayment` now calls `findByPaygovToken` at the start of the use case. If the result is `undefined`, it throws a `NotFoundError` with the message `Transaction with token '<token>' could not be found`. If the token is found, execution proceeds to the Pay.gov SOAP call as before.

### API / Shared Schema
- Added `NotFoundError` class (`statusCode: 404`) in `src/errors/notFound.ts`, following the same pattern as `ForbiddenError`.
- Added `NotFoundErrorSchema` in `src/schemas/Error.schema.ts`.
- Registered the schema and added a `404` response to the `processPayment` endpoint in `src/openapi/registry.ts`.

### Testing
- Added `jest.mock` for `TransactionModel` in `processPayment.test.ts` with a `beforeEach` that defaults to returning a found transaction, keeping existing tests unaffected.
- New unit test in `processPayment.test.ts`: `throws NotFoundError when token is not in the database`.
- New handler test in `lambdaHandler.test.ts`: `returns 404 when token is not found`, verifying the error propagates correctly through `handleError`.
