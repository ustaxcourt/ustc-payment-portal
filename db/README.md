# Database Migrations and Seeds

Migration and seed files for the root Knex config (`knexfile.ts`, which
delegates to [`src/db/knexConfig.ts`](../src/db/knexConfig.ts)).

## Migrations

- Files live in [`db/migrations/`](./migrations/), one timestamped file per
  change. `20260305195503_init_db.ts` creates the `transactions` table; later
  files evolve it. Read them in filename order for the current schema.
- Run from the repo root:

  ```bash
  npm run migrate:latest      # apply
  npm run migrate:rollback    # undo the last batch
  npm run migrate:list        # show applied / pending
  npm run knex -- <command>   # any other knex CLI command
  ```

## Connection Configuration

`src/db/knexConfig.ts` reads these env vars (defaults in parentheses):

```env
DB_HOST      (localhost)
DB_PORT      (5433)          # host-mapped Postgres port from docker-compose.yml
DB_USER      (user)
DB_PASSWORD  (password)
DB_NAME      (mydb)
```

- `development` connects to `DB_NAME`; `test` to `${DB_NAME}_test`;
  `production` uses `DATABASE_URL` when set, otherwise the same fields.
- `local` is an alias of `development`, `staging` an alias of `production`.
- `docker compose up` starts Postgres plus a one-shot `db-init` that runs
  `npm ci && npm run migrate:latest && npm run seed:run` (skipped with
  `MIGRATION_MODE=1`). For the local stack overall, prefer `npm run start:all`.

## Changing the Seed Data

The dummy data is set up to simulate what we expect in production: our two
starting fees, `PETITION_FILING_FEE` and `NONATTORNEY_EXAM_REGISTRATION_FEE`,
each with a realistic spread of payment and transaction states (success, failed,
pending, and the in-flight states). With default settings the seed generates
**3,500 transactions**, dated from the earliest fee activation date up to today.
The seed lives at [`db/seeds/02_dummy_data.ts`](./seeds/02_dummy_data.ts); it
clears the `transactions` table and reinserts generated rows. `npm run seed:run`
runs it manually.

Volume knobs — constants at the top of that file:

| Constant | Default | Meaning |
|---|---|---|
| `SEED_TOTAL_RECORDS` | `3500` | Total rows, spread as evenly as possible across every day from `SEED_START_DATE` to today. Multi-attempt rows count toward this. |
| `SEED_START_DATE` | `2025-01-01` | Earliest day rows are dated to. Clamped forward to the earliest fee activation date if it falls before that. |
| `SEED_MULTI_ATTEMPT_GROUPS` | `10` | Number of failed-attempt-then-successful-retry pairs, reserved out of the total. |

**NOTE:** With the current single-statement insert, `SEED_TOTAL_RECORDS` is
capped near **3,800 rows**: PostgreSQL allows at most 65,535 bind parameters per
statement and each row writes 17 columns (`65535 / 17 ≈ 3855`). The default of
3,500 keeps headroom. To go higher, change the `.insert()` in
`02_dummy_data.ts` to `knex.batchInsert("transactions", rows, 2000)`, which
chunks the rows for you.

Generation logic lives in [`db/seeds/data/transactions.ts`](./seeds/data/transactions.ts),
with the tunable distributions in [`db/seeds/data/utils/`](./seeds/data/utils/):

### Archetypes — state mix across the date range

[`archetypes.ts`](./seeds/data/utils/archetypes.ts), `pickArchetypeForDay`: the
`faker.helpers.weightedArrayElement` weights per age bucket (8+ days ago, 2-7
days, last 2 days). Older days are all terminal (`success` / `failed`); the most
recent days carry the in-flight and ACH-settling states. An "archetype" exists
only for the generator — it's a named `paymentStatus` + `transactionStatus`
pairing (plus which columns that pairing populates).

### Payment method mix

[`payment.ts`](./seeds/data/utils/payment.ts)

- `PAID_METHOD_MIX` is the split between the three supported payment methods:
  by default 70% `plastic_card`, 20% `ach`, 10% `paypal`. Adjust the weights to
  change the ratio.
- `pickPaymentMethod` picks the method from that mix for `success` / `failed`
  rows, forces `ach` for ACH-settling rows, and leaves it null for rows where
  the payer hasn't paid yet (`received` / `initiated` / `processing`).
- `pickFailureReason` chooses a `returnCode` / `returnDetail` pair from the
  Pay.gov code reference in
  [`src/config/payGovReturnCodes.ts`](../src/config/payGovReturnCodes.ts). You
  shouldn't need to touch this.

### Fee mix and activation floor

[`seededFees.ts`](./seeds/data/utils/seededFees.ts): `SEEDED_FEES` sets the ratio
of fees in the data — by default **85%** `PETITION_FILING_FEE`, **15%**
`NONATTORNEY_EXAM_REGISTRATION_FEE`. Tweak these (and add entries) as new fees
land, to keep the sample representative.

**NOTE:** activation dates come straight from `src/config/fees.ts`. Each row is
dated no earlier than the earliest configured fee activation, and its amount is
the fee version in effect on that row's date.

### Metadata shapes

[`metadata.ts`](./seeds/data/utils/metadata.ts): builds the metadata object for
each fee, matching that fee's client contract (`docketNumber` for Dawson;
`email` / `fullName` / `accessCode` for the exam fee). **Add a branch here
whenever a new fee is added to the seed.**

### Timestamp derivation

[`timestamps.ts`](./seeds/data/utils/timestamps.ts): keeps `lastUpdatedAt`,
`transactionDate`, and `paymentDate` consistent for each archetype. You
shouldn't need to touch this during normal use.

## Test Database

`npm run test:db:setup` runs [`scripts/ensure-test-db.js`](../scripts/ensure-test-db.js)
to create `${DB_NAME}_test` if missing, then applies test migrations and the
seed under `NODE_ENV=test`.
