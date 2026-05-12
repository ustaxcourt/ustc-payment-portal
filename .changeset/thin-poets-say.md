---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### initPayment Use Case
**SOAP Call Try-Catch**
- Log a Pino error with details if marking the row as failed in the DB fails.
- If the SOAP call fails, handle it in the `catch` statement by logging the details in a Pino error, and throw a `PayGovError` back to the user, encouraging a retry.

**Mark as Initiated in DB Try-Catch**
- Mark as failed in DB if marking as Initiated fails, and if marking it as `failed` fails, log a Pino error with details.
- Log a Pino error with details if `updateToInitiated` fails, and throw a ServerError back to the user. (This is where the custom messaging in handleError for ServerErrors get used.)

### handleError
- Added a specific error case for `ServerError` that allows us to give the client. a custom message for it in the response.

### Testing
**InitPayment Unit Test Cases:**
- `updates transaction to failed if SOAP request fails`
- `still throws PayGovError if updateToFailed itself rejects when SOAP request fails`
- `calls updateToFailed and throws ServerError when updateToInitiated fails`
- `throws PayGovError when Pay.gov SOAP request fails with a network error`
- `throws PayGovError with the generic retry message when Pay.gov returns an unparseable response (ZodError, handled by base case of catch)`

**HandleError Unit Test Cases**
- Unit tests updated to account for new `ServerError` case of `handleError.ts`
