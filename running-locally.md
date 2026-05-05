# How to run Payment Portal locally for Development

1.  At repo root run `cp .env.example .env` (Creates `.env` file from `.env.example`)

    - See [.env.example](./.env.example) in this repository for environment variable examples. (Already has the values needed for running locally)
    - Note that `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` needs to match the `ACCESS_TOKEN` defined in your `.env` in `ustc-pay-gov-test-server`
    - `LOCAL_DEV=true` bypasses AWS SigV4 authentication. Locally there is no API Gateway to verify signatures, so the auth pipeline returns a dummy IAM role ARN (`arn:aws:iam::000000000000:role/local-dev-role`) and skips the Secrets Manager permissions fetch entirely.

2.  Run `npm install` at repo root.
3.  Run `docker compose up` to spin up a local instance of the Payment Portal database.

#### Pretty-printing logs locally

When running the development server, logs are automatically pretty-printed with colors and timestamps:

```bash
npm run start:server
```

This is enabled automatically because `APP_ENV=local` triggers the `pino-pretty` transport in the logger.

#### Running with custom log levels

To see more verbose output during troubleshooting:

```bash
LOG_LEVEL=debug npm run start:server
```

#### What if I need to stop my DB?

- Use `docker compose down` to gracefully stop the DB container. (Removes the container, but keeps the volume with the DB data)
- Use `docker compose down -v` to gracefully stop the container and **wipe the container's volume**. Note that this will delete any data in your local DB.

## Running integration tests locally

The `init`, `process`, and `transaction` integration tests run against the local Express server (`devServer.ts`) using plain `fetch` — no SigV4 is needed, since there is no API Gateway in front of the local portal. The `sigv4Smoke` suite only runs against a deployed API Gateway and is skipped locally.

Prerequisites — three things must be running on your machine before you start the tests:

1. **Postgres** — `docker compose up` (from this repo).
2. **Pay.gov test server** — clone and start [ustc-pay-gov-test-server](https://github.com/ustaxcourt/ustc-pay-gov-test-server) on `http://localhost:3366` (the URL `.env.example` already points `SOAP_URL` and `PAYMENT_URL` at). Make sure its `ACCESS_TOKEN` matches `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` in your `.env`.
3. **Local payment portal** — `npm run start:server` to bind the portal to `http://localhost:8080`.

Then, in a fourth terminal:

```bash
npm run test:integration:dev
```

This runs `./src/test/integration/` with `sigv4Smoke.test.ts` excluded. The script sets `APP_ENV=local`, which `isLocal()` (from [src/config/appEnv.ts](./src/config/appEnv.ts), introduced in PAY-257) reads to decide whether the test should use plain `fetch` or `signedFetch`. CI runs the same files with `APP_ENV=dev`, so `isLocal()` returns `false` and requests are SigV4-signed against the deployed API.
