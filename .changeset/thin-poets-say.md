---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### initPayment Use Case
- Catches a `ZodError` and rethrows it as a PayGovError if the SOAP response is malformed.
- Pino logs an error if `updateToFailed` fails in the catch for the SOAP call.
- Throws a default PayGovError `There was an error communicating with Pay.gov. Please retry your transaction.` if the ZodError isn't caught.
- For the call to update the transaction in DB to initiated, we now throw a ServerError if the the DB call fails.

### handleError
- Default message uses `err.message || "An unexpected error occurred..."` to safely handle both `undefined` and empty string messages. (Default 500 case)

### Testing
**InitPayment Unit Test Cases:**
- `still throws PayGovError if updateToFailed itself rejects when SOAP request fails`
- `calls updateToFailed and throws ServerError when updateToInitiated fails`
- `throws PayGovError with a bad-response message when Pay.gov returns an unparseable response (ZodError)`

**HandleError Unit Test Cases**
- Default error cases updated to included testing the default case with the hardcoded error message and with a custom message.
