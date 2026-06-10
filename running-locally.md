# Running Payment Portal locally

This document is for **portal contributors** working directly in this repository.

If you are a **downstream developer** (e.g. DAWSON / `ef-cms`) and want to run the portal as a dev dependency, see **[docs/using-as-dev-dependency.md](docs/using-as-dev-dependency.md)** instead — no clone or `.env` required.

---

This document is split into two parts:

1. **Setting up the App to run locally** — one-time setup (clone, install, configure).
2. **Running the App locally** — day-to-day commands once setup is done.

---

## Setting up the App to run locally

One-time steps after cloning the repo.

1. **Create your `.env`**:

   ```bash
   cp .env.example .env
   ```

   See [.env.example](./.env.example). The defaults are pre-tuned for local development — you don't usually need to change anything.

   Notes on a few values:
   - `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` must match `PAY_GOV_TEST_SERVER_ACCESS_TOKEN`. Both default to `development-token`.
   - `LOCAL_DEV=true` bypasses AWS SigV4 authentication. Locally there is no API Gateway to verify signatures, so the auth pipeline returns a dummy IAM role ARN (`arn:aws:iam::000000000000:role/local-dev-role`) and skips the Secrets Manager permissions fetch entirely.
   - `PAY_GOV_NODE_ENV=local` makes the mock Pay.gov server use local file persistence instead of S3. Keep this as `local` for development.

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Confirm Docker is running**. The local Postgres database runs in Docker. Install Docker Desktop (or equivalent) if you don't already have it.

4. **(macOS / Linux only)** Confirm `lsof` is installed. The local startup scripts use it to detect port conflicts. It's pre-installed on macOS and most Linux distros. On Windows the preflight check is skipped — you must free required ports manually before running the stack.

That's it for setup. You won't need to repeat any of these steps unless you reclone the repo or `.env.example` changes.

---

## Running the App locally

### One-command startup (recommended)

```bash
npm run start:all
```

This single command:

1. Checks the configured local ports (`PAY_GOV_TEST_SERVER_PORT`, `API_PORT`, `DB_PORT`) for conflicts. If any are taken, you'll be prompted to free them.
2. Brings up Postgres via `docker compose up -d --wait` and **waits for it to report healthy** (so the portal never races the DB).
3. Starts the local mock Pay.gov server.
4. Starts the portal Express API.
5. On `Ctrl-C`, gracefully stops the Pay.gov server and portal, then stops the docker stack (volumes preserved).

If you also want the script to auto-stop processes holding required ports (instead of prompting), use the autokill variant:

```bash
npm run start:server:autokill
```

The autokill variant prints the process name for each PID before sending `SIGTERM`, so you can see what it's about to stop.

### Running without Pay.gov

If you're iterating on portal code that doesn't touch `/init` or `/process`, you can skip the mock Pay.gov server to keep the output quieter:

```bash
npm run start:portal
```

This brings up Postgres + the portal only. `/init` and `/process` will fail (the portal can't reach a SOAP endpoint that isn't running), but every other route works. Equivalent to `START_PAY_GOV=false npm run start:all`, so you can combine with `AUTO_KILL_PORTS=true` if needed.

### Smoke-checking the running stack

In a second terminal, after the stack is up:

```bash
npm run check:local-flow
```

This sends a `POST /init` to the portal, follows the returned token to the mock Pay.gov `/pay` page, and verifies the response is a real HTML document with the expected mock-page markers (the mock holds the token server-side rather than echoing it in HTML). Exits non-zero if anything is wrong.

### Configuring local ports

Edit `.env` to change ports:

```env
PAY_GOV_TEST_SERVER_PORT="3366"
API_PORT=8080
DB_PORT=5433
```

How each port is used:

- `PAY_GOV_TEST_SERVER_PORT`: mock Pay.gov server bind port.
- `API_PORT`: local Payment Portal Express API bind port.
- `DB_PORT`: host port mapped to Postgres in Docker Compose (`${DB_PORT}:5432`).

Notes:

- `npm run start:all` and `npm run start:server:autokill` read these values at startup.
- If you change `API_PORT`, keep `BASE_URL` aligned (e.g. `BASE_URL="http://localhost:8081"`).
- If you change `PAY_GOV_TEST_SERVER_PORT`, keep `SOAP_URL` and `PAYMENT_URL` aligned.

One-off overrides are also supported without editing `.env`:

```bash
API_PORT=8081 DB_PORT=5434 PAY_GOV_TEST_SERVER_PORT=3367 npm run start:server:autokill
```

### Pretty-printing logs locally

Logs are automatically pretty-printed (colors + timestamps) when `APP_ENV=local`, which is the default in `.env.example`. No extra flags needed.

### Running with custom log levels

```bash
LOG_LEVEL=debug npm run start:all
```

### Stopping the local stack

- `Ctrl-C` in the `start:all` terminal stops everything and calls `docker compose stop` (containers preserved, data preserved).
- `docker compose down` removes the containers but keeps the volume with your DB data.
- `docker compose down -v` removes the containers **and wipes the DB volume**. Use this when you want a clean DB.

### Individual scripts (advanced / debugging)

Most of the time you only need `start:all`. These exist if you want to start pieces in isolation:

- `npm run start:portal` — docker + portal only (skips Pay.gov). Use when iterating on routes that don't call `/init` or `/process`.
- `npm run start:dev-server` — only the portal API (`src/devServer.ts`). Assumes Postgres and the Pay.gov server are already running.
- `npm run start:pay-gov-test-server` — only the local mock Pay.gov server. **Does not auto-load `.env`** — either export the required vars in your shell, or run it as `node -r dotenv/config scripts/start-pay-gov-test-server.js`. When invoked indirectly via `start:all`, env is already loaded and inherited.
- `npm run docker` — only the Postgres stack in the foreground.

---

## Running integration tests locally

The `init`, `process`, and `transaction` integration tests run against the local Express server (`devServer.ts`) using plain `fetch` — no SigV4 is needed, since there is no API Gateway in front of the local portal. The `sigv4Smoke` suite only runs against a deployed API Gateway and is skipped locally.

1. In one terminal, start the full local stack:

   ```bash
   npm run start:all
   ```

2. In a second terminal, run the integration tests:

   ```bash
   npm run test:integration:dev
   ```

This runs `./src/test/integration/` with `sigv4Smoke.test.ts` excluded. The script sets `APP_ENV=local`, which `isLocal()` (from [src/config/appEnv.ts](./src/config/appEnv.ts), introduced in PAY-257) reads to decide whether the test should use plain `fetch` or `signedFetch`. CI runs the same files with `APP_ENV=dev`, so `isLocal()` returns `false` and requests are SigV4-signed against the deployed API.
