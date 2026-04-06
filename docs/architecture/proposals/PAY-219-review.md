# PAY-219: Code Review — InitPayment Error Responses

This document captures the issues found during review of the `PAY-219-InitPayment-Error-Responses` branch. Items are grouped by severity. The goal is to merge this branch with confidence that it is production-safe and won't require immediate follow-up fixes.

---

## Already Fixed in This Branch

### `handleError.ts` — replaced with type-safe implementation

The original change from `err.statusCode < 500` to `err.statusCode` was too broad. Any error with a `statusCode` property would have been passed through verbatim — including `ServerError` instances with status 500, which would leak internal error messages to API clients.

The replacement (`feature/PAY-051-init-client-response` approach) is strictly better:

- Parameter typed as `unknown` instead of `any` — forces explicit narrowing, no accidental property access on untyped values
- `instanceof PayGovError` is checked first and explicitly → 504
- The `statusCode < 500` guard is preserved — only client errors (4xx) pass through with their message; server errors fall to the generic catch-all
- `buildResponse` and `corsHeaders` are exported for reuse by other handlers
- CORS headers are now included on all error responses

---

## Must Fix Before Merge

### 1. `initPayment.ts` — `updateToFailed` called even when `createReceived` never succeeded

**File:** [src/useCases/initPayment.ts](../../../src/useCases/initPayment.ts)

The nested try/catch structure has a logic gap. When `createReceived` throws, the outer `catch` block calls `updateToFailed(agencyTrackingId)` — but the row was never inserted, so that call will silently fail against a non-existent record.

```ts
// Current (problematic)
try {
  await TransactionModel.createReceived({...}); // if this throws...
  try {
    result = await req.makeSoapRequest(appContext);
  } catch (soapErr) {
    throw new PayGovError(...);
  }
  await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
} catch (err) {
  await TransactionModel.updateToFailed(agencyTrackingId); // ...this runs on a row that doesn't exist
  ...
}
```

**Fix:** Track whether the DB record was created, and only call `updateToFailed` if it was:

```ts
let recordCreated = false;
try {
  await TransactionModel.createReceived({...});
  recordCreated = true;

  let result;
  try {
    result = await req.makeSoapRequest(appContext);
  } catch (soapErr) {
    throw new PayGovError(`Failed to communicate with Pay.gov: ${soapErr instanceof Error ? soapErr.message : String(soapErr)}`);
  }

  await TransactionModel.updateToInitiated(agencyTrackingId, result.token);
  return {
    token: result.token,
    paymentRedirect: `${process.env.PAYMENT_URL}?token=${result.token}&tcsAppID=${fee.tcsAppId}`,
  };
} catch (err) {
  if (recordCreated) {
    await TransactionModel.updateToFailed(agencyTrackingId);
  }
  if (err instanceof PayGovError) throw err;
  throw new ServerError(`Failed to initiate payment: ${err instanceof Error ? err.message : String(err)}`);
}
```

This also eliminates the `let result` declared outside the try/catch, which is currently relying on TypeScript not being able to prove it's set before `result.token` is accessed after the block.

### 2. `handleError.test.ts` — test for DB-write failure asserts incorrect behavior

**File:** [src/useCases/initPayment.test.ts](../../../src/useCases/initPayment.test.ts) (line 137)

The test `"throws ServerError and updates transaction to failed if DB write fails"` calls `TransactionModel.updateToFailed` and expects it to have been called even when `createReceived` rejected. This is testing the current broken behavior. Once issue #1 is fixed, this test should assert that `updateToFailed` is **not** called when `createReceived` fails.

### 3. `lambdaHandler.ts` — mutation of request object and boolean flag parameter

**File:** [src/lambdaHandler.ts](../../../src/lambdaHandler.ts) (lines 27, 33–35)

Two problems with the `injectClientName` approach:

```ts
// Boolean flag that changes function behavior — code smell
const lambdaHandler = async (
  request: any,
  requestContext: APIGatewayEventRequestContext,
  callback: LambdaHandler,
  feeId?: string,
  injectClientName?: boolean   // ← boolean flag
): Promise<APIGatewayProxyResult> => {
  const client = await authorizeClient(roleArn, feeId);
  if (injectClientName && client && typeof request === 'object') {
    request.clientName = client.clientName; // ← mutates the caller's object
  }
```

Boolean flags that change a function's behavior are a maintenance hazard — the next engineer reading this has to trace exactly what `true` does. Mutation of the passed `request` object is also unexpected.

**Fix:** Give `initPaymentHandler` its own thin wrapper that constructs the internal request explicitly:

```ts
export const initPaymentHandler = (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const { value: rawBody, error } = safeJsonParse(event.body);
  if (error) return Promise.resolve(error);

  const parsed = InitPaymentRequestSchema.safeParse(rawBody);
  if (!parsed.success) return Promise.resolve(handleError(parsed.error));

  return lambdaHandler(
    parsed.data,
    event.requestContext,
    async (ctx, req) => {
      const roleArn = extractCallerArn(event.requestContext);
      const client = await authorizeClient(roleArn, parsed.data.feeId);
      return appContext.getUseCases().initPayment(ctx, { ...req, clientName: client.clientName });
    }
  );
};
```

Or, simpler: keep `lambdaHandler` focused on auth + dispatch, and resolve `clientName` before calling it.

### 4. CORS headers missing from success responses

**File:** [src/lambdaHandler.ts](../../../src/lambdaHandler.ts) (lines 37–40)

`handleError` now returns CORS headers on every error response via `buildResponse`. The success path does not:

```ts
return {
  statusCode: 200,
  body: JSON.stringify(result), // no headers
};
```

A browser client that hits a 200 will not receive `Access-Control-Allow-Origin` and will be blocked by CORS. Import `corsHeaders` from `./handleError` and add it to the success response:

```ts
import { handleError, corsHeaders } from "./handleError";

// ...
return {
  statusCode: 200,
  headers: corsHeaders,
  body: JSON.stringify(result),
};
```

---

## Should Fix in a Follow-up Ticket

### 5. `InitPaymentInternalRequest` is defined in the wrong file

**File:** [src/useCases/initPayment.ts](../../../src/useCases/initPayment.ts) (line 14)

```ts
type InitPaymentInternalRequest = InitPaymentRequest & { clientName: string };
```

This type is defined in the use case file but describes a request shape — it belongs in `InitPayment.schema.ts` alongside `InitPaymentRequest`. It's also not exported, so callers constructing the internal request (like tests) have to manually replicate the shape with `& { clientName: string }`.

### 6. Transaction status values are inline string literals

**File:** [src/useCases/initPayment.ts](../../../src/useCases/initPayment.ts) (lines 55–56)

```ts
paymentStatus: 'pending',
transactionStatus: 'received',
```

These magic strings appear in both the use case and the DB model. If the allowed values ever change, there are multiple files to update and no compile-time safety. These should be typed constants or a Zod enum shared between the schema and the model.

### 7. `corsHeaders` duplicated across dashboard handlers

**File:** [src/lambdaHandler.ts](../../../src/lambdaHandler.ts) (lines 119–129)

`getDashboardCorsHeaders()` constructs its own header object dynamically using `DASHBOARD_ALLOWED_ORIGIN`. Once the main `corsHeaders` constant is wired into the success path (issue #4), evaluate whether dashboard handlers should share the same CORS utility or keep their own — they currently allow a configurable origin, which may be intentional for dashboard security. Document the distinction explicitly.

### 8. `authorizeClient` null-check is defensive noise

**File:** [src/lambdaHandler.ts](../../../src/lambdaHandler.ts) (line 33)

```ts
if (injectClientName && client && typeof request === 'object') {
```

The `client &&` check implies `authorizeClient` may return `null` or `undefined`. If it does, the `clientName` injection is silently skipped and `initPayment` will receive a request without `clientName`, likely crashing at runtime. Either `authorizeClient` always returns a client (in which case the null check is noise) or it can return null (in which case that should be an explicit error, not a silent skip). The return type of `authorizeClient` should make this unambiguous.

---

## Summary Checklist

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| — | `handleError.ts` type safety and guard correctness | Must Fix | Done |
| 1 | `updateToFailed` called when `createReceived` never ran | Must Fix | Open |
| 2 | Test asserts incorrect behavior for DB-write failure | Must Fix | Open |
| 3 | Boolean flag + request mutation in `lambdaHandler` | Must Fix | Open |
| 4 | CORS headers missing from success responses | Must Fix | Open |
| 5 | `InitPaymentInternalRequest` defined in wrong file | Follow-up | Open |
| 6 | Transaction status values are inline string literals | Follow-up | Open |
| 7 | `corsHeaders` duplicated in dashboard handlers | Follow-up | Open |
| 8 | `authorizeClient` return type ambiguity | Follow-up | Open |
