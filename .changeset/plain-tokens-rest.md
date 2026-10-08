---
"@ustaxcourt/payment-portal": patch
---

Stop sending a bearer token to the Pay.gov test server when running locally, following `@ustaxcourt/ustc-pay-gov-test-server@0.4.0`, which skips its token check when `APP_ENV=local`.

- `getPayGovAuthHeaders` now only fetches and sends the token when `APP_ENV=dev`.
- `start-pay-gov-test-server` no longer passes `ACCESS_TOKEN` and forces `APP_ENV=local` for the child process.
- Remove `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` and `PAY_GOV_TEST_SERVER_ACCESS_TOKEN` from `.env.example`, the `ustc-payment-portal` bin, the Dependabot validation workflow, and `running-locally.md`.

Also fix the `npm run start:all` port preflight, which offered to kill Docker's own port forwarder (`com.docker.backend`, `docker-proxy`, etc.) when the Postgres port was already published by a running container. Killing it took the Docker daemon down and broke the run. Docker-owned processes are now left alone, so `docker compose up` reuses the container or reports a real conflict.
