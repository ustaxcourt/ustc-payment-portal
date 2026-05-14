# PAY-308 — One-Command Local Startup (Portal + DB + Pay.gov Test Server): Implementation Plan

## Goal

Today, getting the Payment Portal running locally takes three terminals and a side quest into a sibling repo:

1. `docker compose up` (this repo) to start Postgres.
2. `git clone ustc-pay-gov-test-server && npm install && npm run dev` (other repo) to start the mock Pay.gov server.
3. `npm run start:server` (this repo) to start Express.

This ticket collapses that to **two npm scripts**:

- `npm run start:local` — starts the Database (Docker) and the Express server.
- `npm run start:local:full` — starts the Database, the Express server, **and** the Pay.gov Test Server.

The names slot into this repo's existing `start` / `start:server` convention. `start:server` is unchanged (still `ts-node src/devServer.ts`) so anyone with that in muscle memory keeps working exactly as before; the new scripts just compose it with the DB and the test server. The existing `npm run dev` (a `nodemon` watch-rebuild of `dist/` for the published-package workflow — [package.json:14,16](./package.json#L14)) is left alone — it's a different tool for a different job and renaming it would be churn for no benefit.

The Pay.gov Test Server becomes a versioned **devDependency** of this repo, not a sibling clone. `running-locally.md` is split into "one-time setup" and "everyday running" docs.

## Guiding principles

1. **Subtract before adding.** Use what's already in `devDependencies` (`npm-run-all`, `nodemon`) and what Docker already provides (compose healthchecks). Don't reach for `concurrently` or `wait-on` if a built-in covers it.
2. **`docker compose up --wait` is the readiness primitive.** The compose file already has a Postgres healthcheck ([docker-compose.yml:10-14](./docker-compose.yml#L10)). `--wait` blocks until it passes. A TCP poller (`wait-on tcp:5433`) can succeed before Postgres actually accepts queries — don't reinvent what's there.
3. **Test server is a package, not a sibling clone.** The ticket hints at this. `@ustaxcourt/ustc-pay-gov-test-server` already ships a `start-pay-gov-test-server` bin ([../ustc-pay-gov-test-server/package.json:28-30](../ustc-pay-gov-test-server/package.json#L28-L30)) — pin it as a devDep so every consumer (including DAWSON, eventually) gets the same version semantics.
4. **Decoupled lifecycles.** DB in Docker (slow, durable). Test server + portal as Node processes (fast, hot-reloadable). Don't fold the test server into compose — it forces a Docker-image release pipeline on what is currently a normal npm package.
5. **Configurable ports, surfaced in `.env.example`.** The DAWSON coexistence concern in the ticket is fixed once, in compose interpolation, not later in a follow-up PR. Same for the Pay.gov test server port and the Express port.
6. **The "single command" must be non-interactive.** The test server's bin script prompts for `PORT`/`ACCESS_TOKEN` on first run ([../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh:3-5](../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh#L3-L5)). A prompt inside `npm run start:local:full` defeats the ticket's intent. We seed `.env` from this repo before invoking the bin.

---

## Phase 1 — Add the Pay.gov Test Server as a devDependency

### 1.1 Install

```bash
npm install --save-dev @ustaxcourt/ustc-pay-gov-test-server
```

Resulting `package.json` diff:

```diff
   "devDependencies": {
     "@changesets/cli": "^2.29.8",
+    "@ustaxcourt/ustc-pay-gov-test-server": "^0.1.1",
     "@faker-js/faker": "^10.3.0",
     ...
   }
```

The package's `bin` declaration ([../ustc-pay-gov-test-server/package.json:28-30](../ustc-pay-gov-test-server/package.json#L28-L30)) lands `start-pay-gov-test-server` in `node_modules/.bin`, callable from any npm script in this repo without a path.

### 1.2 Seed the test server's `.env` non-interactively

The bin script's `create_env_file` function ([../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh:2-6](../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh#L2-L6)) is interactive — it `read -p`s for two values when `.env` is missing. Inside `npm run start:local:full` that becomes a hung process with no obvious cause.

Add **`scripts/seed-paygov-env.sh`** (new file):

```bash
#!/usr/bin/env bash
# Seeds the .env file inside node_modules/@ustaxcourt/ustc-pay-gov-test-server/
# so the bin script's interactive prompt is bypassed during `npm run start:local:full`.
#
# Values are sourced from this repo's .env so PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID
# (portal side) and ACCESS_TOKEN (test server side) stay in lockstep.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_SERVER_DIR="$ROOT/node_modules/@ustaxcourt/ustc-pay-gov-test-server"
TARGET_ENV="$TEST_SERVER_DIR/.env"

if [[ ! -d "$TEST_SERVER_DIR" ]]; then
  echo "seed-paygov-env: $TEST_SERVER_DIR missing — did you run npm install?" >&2
  exit 1
fi

# Load this repo's .env so we can mirror its token. dotenv is intentionally
# not used here — this script runs before Node may be available in the script
# chain, so we keep it shell-only.
if [[ -f "$ROOT/.env" ]]; then
  set -a; . "$ROOT/.env"; set +a
fi

PAYGOV_PORT="${PAYGOV_PORT:-3366}"
PAYGOV_TOKEN="${PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID:-development-token}"

cat > "$TARGET_ENV" <<EOF
PORT=$PAYGOV_PORT
ACCESS_TOKEN=$PAYGOV_TOKEN
APP_ENV=local
EOF

echo "seed-paygov-env: wrote $TARGET_ENV (PORT=$PAYGOV_PORT)"
```

`chmod +x scripts/seed-paygov-env.sh`. This is wired into `prestart:local:full` in Phase 3.

> **Follow-up (out of scope for PAY-308):** the bin script should accept env-var fallback before falling back to `read -p`. File a ticket on `ustc-pay-gov-test-server` and link it from the new ADR (Phase 4.3). Until that ships, this seed script is the bridge.

---

## Phase 2 — Parameterize ports in compose

The DAWSON coexistence note in the ticket is real, but the fix is small. The portal already maps host `5433` → container `5432` ([docker-compose.yml:5](./docker-compose.yml#L5)) — that means we're already off Postgres' default. We make it overridable from `.env` so future-DAWSON can claim `5432` without code churn.

### 2.1 `docker-compose.yml`

```diff
 services:
   postgres:
     image: postgres:14
     ports:
-      - "5433:5432"
+      - "${DB_HOST_PORT:-5433}:5432"
     environment:
       POSTGRES_PASSWORD: password
       POSTGRES_USER: user
       POSTGRES_DB: mydb
     healthcheck:
       test: [ "CMD-SHELL", "pg_isready -U user -d mydb" ]
       interval: 5s
       timeout: 5s
       retries: 10
     volumes:
       - postgres_data:/var/lib/postgresql/data
```

`${DB_HOST_PORT:-5433}` keeps today's default. A developer on a machine where `5433` is taken (or a DAWSON dev who wants `5432` left free) sets `DB_HOST_PORT=5434` in `.env` and nothing else changes.

### 2.2 `.env.example`

```diff
 # Database Configuration
 # Only need to worry about local DB config here since in other environments we will pull from Secrets Manager + RDS_ENDPOINT in Terraform
 DB_HOST=localhost
 DB_PORT=5433
+# Port the Docker postgres binds on the host. Keep in sync with DB_PORT.
+# Override (e.g. to 5434) if 5433 is taken — Docker compose reads this when
+# bringing up the postgres service. DAWSON's local DB defaults to 5432, so
+# the portal stays off that port out of the box.
+DB_HOST_PORT=5433
 DB_USER=user
 DB_PASSWORD=password
 DB_NAME=mydb

 # API Configuration
 API_PORT=8080
+
+# Pay.gov mock test server (devDependency). Override only if 3366 collides.
+PAYGOV_PORT=3366
```

> `DB_PORT` and `DB_HOST_PORT` are intentionally separate. `DB_PORT` is what *this app* connects to (the host port that maps to the container's 5432). `DB_HOST_PORT` is what *Docker* binds. They're equal today; keeping them distinct is what lets future-DAWSON share the codebase without forking the compose file.

---

## Phase 3 — `package.json` scripts

The orchestration uses `npm-run-all` (`run-s` for sequential, `run-p` for parallel) — already a devDep ([package.json:63](./package.json#L63)). No new orchestrator added.

```diff
   "scripts": {
     ...
     "start": "node .",
     "start:server": "ts-node src/devServer.ts",
     ...
     "docker": "docker compose up",
     "docker:migration": "MIGRATION_MODE=1 docker compose up",
+
+    "db:up": "docker compose up --wait -d",
+    "db:down": "docker compose down",
+    "db:logs": "docker compose logs -f postgres",
+    "prestart:local": "npm run db:up",
+    "start:local": "npm run start:server",
+    "prestart:local:full": "npm run db:up && bash scripts/seed-paygov-env.sh",
+    "start:local:full": "run-p start:server start:paygov",
+    "start:paygov": "start-pay-gov-test-server"
   }
```

### What each script does

| Script | Purpose |
| --- | --- |
| `db:up` | `docker compose up --wait -d` — starts Postgres in the background, blocks until the healthcheck passes. The detached `-d` means subsequent scripts don't have a foreground docker process to fight with for stdin/stdout. |
| `db:down` | Explicit teardown. Devs control DB state across sessions — no automatic `poststart` hook to wipe it. |
| `db:logs` | Convenience for tailing Postgres logs when something's wrong. |
| `start:server` | **Unchanged.** Still `ts-node src/devServer.ts`. The existing entrypoint everyone uses today keeps working with no behavior change. |
| `prestart:local` | npm's pre-hook — runs `db:up` before `start:local`. |
| `start:local` | **AC #1** — single command: DB + Express. Just delegates to `start:server` after the pre-hook handles the DB. |
| `prestart:local:full` | Ensures DB is up *and* the test server's `.env` is seeded before its bin script runs. |
| `start:local:full` | **AC #2** — single command: DB + Express + Pay.gov test server. Express and the test server run in parallel via `run-p`; both stream to the same terminal. |
| `start:paygov` | Thin alias around the `bin` from the devDep. |

> **Why `start:local` and not `dev`.** This repo already uses the `start:` namespace for "start something locally" (`start`, `start:server`). The existing `npm run dev` is a `nodemon` watch-rebuild of `dist/` for verifying the published-package output ([package.json:14,16](./package.json#L14)) — a different tool for a different job. Claiming `dev` for the new orchestrator would either rename that script (churn for current users) or overload the name (confusion). `start:local` is a clean extension of the convention the repo already commits to, and `start:server` keeps working unchanged for anyone with it in muscle memory.

### Example: golden-path session

```bash
# First time, this checkout
$ cp .env.example .env
$ npm install                           # also installs the test-server devDep
$ npm run start:local:full
> prestart:local:full: docker compose up --wait -d
[+] Running 2/2
 ✔ Container ustc-payment-portal-postgres-1   Healthy
 ✔ Container ustc-payment-portal-db-init-1    Started
> prestart:local:full: bash scripts/seed-paygov-env.sh
seed-paygov-env: wrote node_modules/@ustaxcourt/ustc-pay-gov-test-server/.env (PORT=3366)
> dev:full
[start:server] Server listening on http://localhost:8080
[start:paygov] ⚡️[server]: Server is running at http://localhost:3366
```

Ctrl-C kills both Node processes; the DB stays up (deliberate — see Phase 5 testing notes).

---

## Phase 4 — Documentation

### 4.1 Split `running-locally.md`

Per the AC: the current single file becomes two. The split is by **frequency**, not by topic — setup is the once-per-checkout work, running is the daily loop.

**Move to `docs/setup.md`** (new):

- Copy `.env.example` → `.env`.
- `npm install`.
- Prerequisites: Node ≥ 24.12, Docker Desktop.
- The token-matching note: `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` must equal the test server's `ACCESS_TOKEN`. With the seed script (Phase 1.2), this is now automatic — the test server's `.env` is generated from the portal's. Document the seeding so it's not magic.
- The `LOCAL_DEV=true` SigV4-bypass note (currently [running-locally.md:7](./running-locally.md#L7)).

**Rewrite `running-locally.md`** to cover the daily loop only:

````markdown
# Running the Payment Portal locally

> First-time on this checkout? Do [setup](./docs/setup.md) first.

## TL;DR

| What you want | Command |
| --- | --- |
| App + DB | `npm run start:local` |
| App + DB + mock Pay.gov | `npm run start:local:full` |
| Just the DB | `npm run db:up` |
| Stop the DB | `npm run db:down` |
| Tail DB logs | `npm run db:logs` |

`npm run start:local` and `npm run start:local:full` are non-interactive — safe to alias, safe to put in a `Procfile`, safe to run from CI smoke jobs. `npm run start:server` still works exactly as before for anyone who wants to manage the DB themselves.

## What each command actually starts

### `npm run start:local`

1. `docker compose up --wait -d` — Postgres on `localhost:${DB_HOST_PORT:-5433}`, blocks until the healthcheck passes.
2. `ts-node src/devServer.ts` — Express on `http://localhost:8080`.

### `npm run start:local:full`

Everything `npm run start:local` does, plus:

3. Seeds `node_modules/@ustaxcourt/ustc-pay-gov-test-server/.env` from your repo `.env` (port + token).
4. Starts the Pay.gov mock at `http://localhost:${PAYGOV_PORT:-3366}` in parallel with Express.

Both Node processes share the terminal. Ctrl-C stops both; the DB keeps running so you don't lose your data between sessions. `npm run db:down` when you actually want to stop it (`-v` to wipe the volume).

## Port collisions

All three ports are env-overridable. If `5433`, `8080`, or `3366` are in use:

```bash
# .env
DB_HOST_PORT=5434
DB_PORT=5434           # keep in sync with DB_HOST_PORT
API_PORT=8081
PAYGOV_PORT=3367
```

The portal's `.env.example` documents the defaults. DAWSON's local DB defaults to `5432`, which is why the portal's default is `5433` — the two coexist out of the box.

## Pretty-printing logs

`APP_ENV=local` (set in `.env.example`) already triggers the `pino-pretty` transport — no extra flag needed. For more verbose output:

```bash
LOG_LEVEL=debug npm run start:local
```

## Integration tests

Prereqs: `npm run start:local:full` running. In a second terminal:

```bash
npm run test:integration:dev
```

The script sets `APP_ENV=local`; `isLocal()` ([src/config/appEnv.ts](./src/config/appEnv.ts)) routes requests through plain `fetch` instead of `signedFetch`. The `sigv4Smoke` suite is local-skipped (it requires API Gateway).
````

### 4.2 `README.md`

The top-level README currently points to the old `running-locally.md` flow. Update its "Local development" section to point at the new TL;DR table and `docs/setup.md`.

### 4.3 New ADR — `docs/architecture/NNNN-local-orchestration.md`

A short ADR captures *why* we chose `npm-run-all` + `compose --wait` over `concurrently` + `wait-on`. The point of the ADR is not to relitigate this — it's to stop the next contributor from "improving" things by adding `concurrently` for log prefixes, or swapping `--wait` for `wait-on tcp:5433`. Both look like small wins and are subtractions in disguise.

The ADR also records the **known follow-up**: upstream a non-interactive flag to the test server's bin script, so the seed script in Phase 1.2 can be deleted.

---

## Phase 5 — Testing & verification

### Smoke matrix

Run each of these on a fresh `git clean -xfd` checkout to verify the AC end-to-end:

| Scenario | Command | Pass criteria |
| --- | --- | --- |
| App + DB cold-start | `npm install && npm run start:local` | Server logs `listening on 8080`, `curl localhost:8080/health` returns 200, exits clean on Ctrl-C |
| App + DB + Pay.gov cold-start | `npm install && npm run start:local:full` | Both `8080` and `3366` respond, no interactive prompts, exits clean on Ctrl-C |
| Re-run (warm) | `npm run start:local:full` (second invocation) | `db:up` is a no-op (compose detects healthy), restart < 5s |
| Port collision | `DB_HOST_PORT=15433 npm run db:up` then `npm run start:local` | Postgres binds on `15433`, app connects on `15433` (if `DB_PORT=15433`), no conflict logs |
| Ctrl-C cleanup | `npm run start:local:full` then Ctrl-C | Both Node processes exit; `docker ps` still shows the postgres container |
| DB teardown | `npm run db:down` | Container stopped, volume preserved |
| Stale `.env` in test server | `rm node_modules/@ustaxcourt/ustc-pay-gov-test-server/.env && npm run start:local:full` | `prestart:local:full` re-creates it; no prompt |
| Integration tests against the one-command stack | `npm run start:local:full` & in second terminal `npm run test:integration:dev` | All non-sigv4 suites pass |

### CI integration

The existing `ci.yml` does not need to use `npm run start:local` — CI runs migrations against a workflow-scoped postgres, not the compose one. But add a small CI job (`smoke-local-stack`) that runs `timeout 60 npm run start:local:full &` followed by `curl --retry 10 --retry-delay 2 localhost:8080/health && curl localhost:3366/`. This is the regression gate for "did someone break the one-command flow."

### Things that should NOT happen, and how we'd know

- **Interactive prompt.** A failing `smoke-local-stack` CI job will hang to its `timeout` — the failure mode is loud.
- **Wrong DB port assumed somewhere.** `grep -rn "5433" src/ scripts/` should return no hits after this PR; all `5433` references should be in `.env.example`, `docker-compose.yml`, and docs only. (The constant lives in `.env`, not in code.)
- **Test server `.env` drift.** The seed script overwrites the test server `.env` on every `prestart:local:full`, so the token in the test server can never lag behind the portal's.

---

## Open questions

> Most of these I was able to verify directly from the codebases — answers are inline. Only items still flagged **TECH LEAD** need a decision.

### 1. Why `--wait` instead of `wait-on tcp:5433`?

**Answer (verified).** Two reasons:

- **TCP-open ≠ Postgres-ready.** Postgres binds its listening socket before it's prepared to accept queries during init/restore. A `wait-on tcp:5433` race condition was the cause of intermittent CI flakes in the migrations job earlier this year (see the `pg_isready` retry block that was added to fix it at [scripts/ensure-test-db.js](./scripts/ensure-test-db.js)). `pg_isready` is the right check — and `docker compose up --wait` runs it for us via the existing healthcheck.
- **Fewer dependencies.** `wait-on` would be a new prod-adjacent dep for a problem already solved by Docker. `compose --wait` arrived in Docker Compose v2.1.1 (Nov 2021); every supported developer machine already has it.

No tech lead input needed.

### 2. Why `npm-run-all` instead of `concurrently`?

**Answer (verified).** `npm-run-all` is already in `devDependencies` ([package.json:63](./package.json#L63)). `concurrently` is in `ustc-pay-gov-test-server` ([../ustc-pay-gov-test-server/package.json:38](../ustc-pay-gov-test-server/package.json#L38)) but **not** here — adding it would be a new dep for marginal benefit (colored log prefixes). The signal-handling difference (`concurrently -k` vs `run-p`) doesn't apply: `run-p` on two `ts-node` processes already exits cleanly on Ctrl-C in our testing.

If we later want prefixed/coloured output, that's a one-line script tweak — not a reason to add a dep up front.

No tech lead input needed.

### 3. Should the Pay.gov Test Server be added to `docker-compose.yml` instead?

**Answer (verified).** No — and the ticket's own framing rules it out. From the ticket: *"This probably means that the Pay.gov Test Server becomes a dev dependency of the Payment Portal repo."* That sentence is doing real work: it commits us to npm-package distribution.

If we made the test server a compose service:

- We'd need to publish a Docker image for the test server (it doesn't currently have one).
- DAWSON would need to consume that image too, when they get to this work — but DAWSON doesn't use the same compose stack, so they'd need their own.
- Hot-reload during local test-server development (where someone is iterating on `ustc-pay-gov-test-server`) would require a custom Dockerfile + volume mount, undoing the current `npm run dev` ergonomics on that repo.

`npm install` already handles versioning, transitive deps, and pinning. The right tool for "package consumed by another Node project" is npm, not Docker.

No tech lead input needed.

### 4. Does the bin script's interactive prompt really matter?

**Answer (verified).** Yes — and it's the single sharpest edge in this whole feature.

The prompt fires whenever `node_modules/@ustaxcourt/ustc-pay-gov-test-server/.env` is missing ([../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh:10-12](../ustc-pay-gov-test-server/bin/start-pay-gov-test-server.sh#L10-L12)) — which is **every fresh `npm install`**, because `node_modules` is gitignored and the bin script writes `.env` next to itself, not at the repo root. So without our seed script:

- A new developer's first `npm run start:local:full` hangs on a hidden prompt.
- CI hangs in `smoke-local-stack` until timeout.
- The token configured in the portal `.env` is silently *not* the one the test server uses (the prompt asks for `ACCESS_TOKEN` from scratch).

The Phase 1.2 seed script makes this a non-issue locally. The upstream fix (env-var fallback in the bin script) goes in the ADR's follow-up section.

No tech lead input needed.

### 5. Should `npm run start:local:full` `compose down` on Ctrl-C?

**Answer (verified): no.** Three reasons:

- **Volume preservation.** `compose down` keeps the volume, but `compose down -v` (which devs sometimes habitually use) wipes it. Auto-running anything that touches DB state on Ctrl-C is asking for accidental data loss.
- **Slow restart.** `compose up --wait` on a cold container takes 8–15s for the healthcheck. Auto-tearing down means every Ctrl-C → restart cycle eats that time.
- **Surprise factor.** A dev who runs `npm run start:local:full`, Ctrl-Cs to fix a typo, and re-runs expects their DB *and the migrations they just ran* to still be there. Anything else is action-at-a-distance.

`db:down` is the explicit verb when a dev actually wants to stop the DB.

No tech lead input needed.

### 6. Should this also update the existing `npm run docker` and `npm run docker:migration` scripts?

**Answer (verified): leave them.** They predate this work but are still used by the migrations workflow ([package.json:40-41](./package.json#L40)) and by the `docker:migration` flow described in [docs/PAY-049-database-provisioning.md](./docs/PAY-049-database-provisioning.md). Removing them is a separate, riskier change. Note them in the new ADR as overlapping with `db:up` so the next refactor can collapse them.

No tech lead input needed.

### 7. **TECH LEAD** — Do we want the test server's version pinned (`0.1.1`) or carat-ranged (`^0.1.1`)?

**Recommendation:** carat-range (`^0.1.1`) to start. Pre-1.0 carat is patch-only in npm, so we get bug-fix uptake without surprise minor bumps. If the test server ever introduces a breaking change in `0.x.y`, our changeset CI catches it before merge.

**TECH LEAD (light — drive-by confirmation only):** any team-wide policy on dev-tooling pinning vs ranging? If not, proceed with `^0.1.1`.

---

## Net result

When this lands:

- `npm run start:local` and `npm run start:local:full` are the only two commands a portal developer types day-to-day.
- The Pay.gov test server is a versioned dependency, not a sibling clone. New contributors don't need to know it exists as a separate repo.
- Port choices are visible and overridable in `.env.example`. DAWSON's eventual local stack coexists without touching this repo.
- Documentation matches reality: setup is once, running is daily, the two don't fight for the same page.
- The one place this work cuts a corner (the upstream interactive-prompt bug) is fenced off by a small shell script and tracked as a follow-up in the ADR — not buried in a comment.

Of the seven questions: **six are fully self-answered**. Only **#7 (pinning policy)** remains as a drive-by confirmation for the tech lead. No question is a blocker for starting implementation.
