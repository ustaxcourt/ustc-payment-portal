# Database Setup, Migrations, and Seeds (Knex + TypeScript)

This directory contains the Knex migrations and seeds used to manage the schema and dev/test data for the Payment Portal service.

Knex is configured to run **TypeScript** migrations and seeds using `ts-node`.
Your configuration lives in the project root at **`knexfile.ts`**.

***

## 1. Environment Configuration

Database connection settings come from `.env` (already loaded via `dotenv/config`):

    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=user
    DB_PASSWORD=password
    DB_NAME=mydb
    DB_POOL_MIN=2
    DB_POOL_MAX=10

These values match your `docker-compose.yml` Postgres container:

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
```

Before running migrations or seeds, ensure that:

```bash
docker compose up
```

This will start Postgres on `localhost:5432` using the credentials above.

***

## 2. Knex Configuration (TypeScript)

Knex is configured through **`knexfile.ts`**, which:

*   Loads `.env` automatically
*   Uses `pg` for PostgreSQL
*   Uses the directories:
    *   **`./db/migrations`**
    *   **`./db/seeds`**
*   Uses `.ts` files for both

Each environment (`development`, `test`, `production`) reads from the same env variables.

***

## 3. NPM Scripts

The project exposes Knex CLI commands through the following scripts:

```jsonc
"knex": "node -r ts-node/register -r dotenv/config ./node_modules/knex/bin/cli.js",
"migrate:make": "npm run knex -- migrate:make $1",
"migrate:unlock": "npm run knex -- migrate:unlock",
"migrate:latest": "npm run knex -- migrate:latest",
"migrate:rollback": "npm run migrate:rollback",
"migrate:list": "npm run knex -- migrate:list",
"migrate:up": "npm run knex -- migrate:up $1",
"migrate:down": "npm run knex -- migrate:down $1",
"seed:make": "npm run knex -- seed:make $1",
"seed:run": "npm run knex -- seed:run"
```

These commands work because:

*   The Knex CLI is executed through Node with `ts-node/register`
*   `.env` is automatically loaded with `dotenv/config`
*   `knexfile.ts` is compiled on the fly

***

## 4. Creating a Migration

You can create a new migration like this:

```bash
npm run migrate:make create_some_table
```

This creates a TypeScript file in:

    ./db/migrations/

with the structure:

```ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
}

export async function down(knex: Knex): Promise<void> {
}
```

### Notes

*   Migrations are timestamped automatically unless a naming convention is enforced.
*   Follow the pattern used in `create_transactions_table.ts`.

***

## 5. Running Migrations

### Apply all pending migrations:

```bash
npm run migrate:latest
```

### Roll back the last batch:

```bash
npm run migrate:rollback
```

### List applied and pending migrations:

```bash
npm run migrate:list
```

### Run a single migration "up":

```bash
npm run migrate:up 20260305123456_create_transactions_table.ts
```

### Run a single migration "down":

```bash
npm run migrate:down 20260305123456_create_transactions_table.ts
```

### Unlock migrations (in case of crash):

```bash
npm run migrate:unlock
```

***

## 6. Creating a Seed File

Create a new seed:

```bash
npm run seed:make initial_data
```

This will create:

    ./db/seeds/<timestamp>_initial_data.ts

with structure:

```ts
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
    // delete or upsert or insert your seed data here
}
```

***

## 7. Running Seeds

Seeds populate the database with initial/test data.

Run all seeds:

```bash
npm run seed:run
```

Seeds run alphabetically; prefix with numbers for ordering:

    01_initial_transactions.ts
    02_more_fixtures.ts

***

## 8. Typical Development Workflow

### 1. Start the database:

```bash
docker compose up
```

### 2. Run migrations:

```bash
npm run migrate:latest
```

### 3. Run seeds:

```bash
npm run seed:run
```

### 4. Make changes:

```bash
npm run migrate:make add_new_columns
```

### 5. Apply updated schema:

```bash
npm run migrate:latest
```

***

## 9. Tips & Best Practices

*   Never modify an already-run migration in a shared environment; create a new one.
*   Use migrations for **schema changes**.
*   Use seeds for:
    *   Local development data
    *   Integration tests
    *   Demo or fixture data
*   Use `.onConflict().merge()` for idempotent seeds in staging/production

***

## 10. Troubleshooting

### “ECONNREFUSED 127.0.0.1:5432”

Postgres container isn’t running:

```bash
docker compose up
```

### “password authentication failed”

Ensure `.env` matches your `docker-compose`:

    DB_USER=user
    DB_PASSWORD=password
    DB_NAME=mydb

### “Cannot find module ‘pg’”

You already have `"pg"` in your dependencies — ensure `node_modules` is installed:

```bash
npm install
```
