# Database Setup, Migrations, and Seeds (Knex + TypeScript)

This directory contains the Knex migrations and seeds used to manage schema and dev/test data for the Payment Portal service.

Knex is configured to run **TypeScript** migrations and seeds using `ts-node` via the project's npm scripts.
Configuration lives at the project root in **`knexfile.ts`**.

---

## 1. Environment Configuration

Database connection settings come from `.env`:

```

DB\_HOST=localhost
DB\_PORT=5432
DB\_USER=user
DB\_PASSWORD=password
DB\_NAME=mydb
DB\_POOL\_MIN=2
DB\_POOL\_MAX=10

````

These match the provided `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:14
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
````

Start the database before running migrations:

```bash
docker compose up
```

Knex **does not create databases**, only tables. Ensure `mydb` exists or is created by docker.

***

## 2. Knex Configuration (TypeScript)

Knex is configured in `knexfile.ts`:

*   Loads `.env` automatically
*   Uses the `pg` PostgreSQL driver
*   Uses TypeScript files for:
    *   `./db/migrations`
    *   `./db/seeds`
*   Exports configs for `development`, `test`, and `production`

Migration state is stored in the table:

    knex_migrations

Batch information is stored in:

    knex_migrations_lock

***

## 3. NPM Scripts

The project exposes Knex CLI commands through these scripts:

```jsonc
"knex": "node -r ts-node/register -r dotenv/config ./node_modules/knex/bin/cli.js",
"migrate:make": "npm run knex -- migrate:make $1",
"migrate:unlock": "npm run knex -- migrate:unlock",
"migrate:latest": "npm run knex -- migrate:latest",
"migrate:rollback": "npm run knex -- migrate:rollback",
"migrate:status": "npm run knex -- migrate:status",
"migrate:list": "npm run knex -- migrate:list",
"migrate:up": "npm run knex -- migrate:up $1",
"migrate:down": "npm run knex -- migrate:down $1",
"seed:make": "npm run knex -- seed:make $1",
"seed:run": "npm run knex -- seed:run"
```

### About `$1` argument passing

`$1` only works in shells that support positional expansion (e.g., Bash).
For portability, prefer:

```bash
npm run migrate:up 20260305_init_db.ts
```

***

## 4. Creating a Migration

```bash
npm run migrate:make create_some_table
```

This creates a TypeScript file in:

    ./db/migrations/

Example structure:

```ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {}
export async function down(knex: Knex): Promise<void> {}
```

### Notes

*   Migrations run in **lexical filename order**.
*   Use timestamps or numeric prefixes for ordering.
*   Never modify a migration that has already run in shared environments.

***

## 5. Running Migrations

### Apply all pending migrations:

```bash
npm run migrate:latest
```

### Roll back the most recent batch:

```bash
npm run migrate:rollback
```

### List which migrations have run or are pending:

```bash
npm run migrate:list
```

### Show summary counts (no filenames):

```bash
npm run migrate:status
```

### Run a single migration up:

```bash
npm run migrate:up
npm run migrate:up 20260305_init_db.ts
```

### Run a single migration down:

```bash
npm run migrate:down
npm run migrate:down 20260305_init_db.ts
```

### Unlock a stuck migration (crash / partial run):

```bash
npm run migrate:unlock
```

***

## 6. Creating a Seed File

```bash
npm run seed:make initial_data
```

This creates:

    ./db/seeds/<timestamp>_initial_data.ts

Example:

```ts
import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {}
```

***

## 7. Running Seeds

Run all seeds:

```bash
npm run seed:run
```

Seeds execute alphabetically. Use prefixes:

    01_initial_transactions.ts
    02_more_fixtures.ts

***

## 8. Typical Development Workflow

```bash
docker compose up            # 1. Start the database
npm run migrate:latest       # 2. Apply migrations
npm run seed:run             # 3. Seed dev data
npm run migrate:make add_x   # 4. Add new migration
npm run migrate:latest       # 5. Reapply
```

***

## 9. CI / Test Databases

Your `test` environment uses:

    DB_NAME_test

Typical CI flow:

```bash
NODE_ENV=test npm run migrate:latest
NODE_ENV=test npm run seed:run
npm test
```

***

## 10. Tips & Best Practices

*   Never edit already-run migrations; make a new one.
*   Write reversible `down` functions.
*   Use seeds for:
    *   Local development
    *   Integration tests
    *   Repeatable fixtures
*   Prefer idempotent seeds using:

```ts
.onConflict(['col1', 'col2']).merge()
```

***

## 11. Troubleshooting

### “ECONNREFUSED 127.0.0.1:5432”

Postgres isn’t running:

```bash
docker compose up
```

### “password authentication failed”

Ensure `.env` matches your docker credentials.

### “Cannot find module 'pg'”

Install dependencies:

```bash
npm install
```

### Migrations don’t run?

Check directory names:

    db/migrations/
    db/seeds/

Ensure files use `.ts`, not `.js`, with correct exports:

```ts
export async function up() {}
export async function down() {}
```
