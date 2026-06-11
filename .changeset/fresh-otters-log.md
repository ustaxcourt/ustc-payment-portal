---
"@ustaxcourt/payment-portal": patch
---

Ensure `handleError` logs with request context.

- `handleError` now accepts an `AppContext` logger and includes `statusCode` in structured log fields.
- Error severity behavior is preserved: 4xx responses log at `warn`, 5xx responses log at `error`.
- Local dev server and Lambda handler now pass context-aware loggers to `handleError`.
- For JSON parse failures in the dev server, a minimal request context is created so invalid-body errors still log with method/path context.
