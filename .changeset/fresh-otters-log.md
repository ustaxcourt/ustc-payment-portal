---
"@ustaxcourt/payment-portal": patch
---

Ensure `handleError` logs with request context.

- `handleError` now follows the shared use case convention by accepting `AppContext` as the first parameter, and includes `statusCode` in structured log fields.
- Error severity behavior is preserved: 4xx responses log at `warn`, 5xx responses log at `error`.
- Local dev server and Lambda handler now pass `AppContext` to `handleError`, so request context is available for logging.
- For JSON parse failures in the dev server, a minimal request context is created so invalid-body errors still log with method/path context.
