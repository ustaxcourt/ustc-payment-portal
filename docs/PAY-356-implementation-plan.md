# PAY-356 — Automated DB Migration-Rollback Path — Implementation Plan

> **Story:** As a USTC Dev Ops engineer, so that I can roll back a failed deployment
> quickly and easily, I need an automated DB migration rollback path.
>
> **ACs:** (1) Some means exists to trigger a migration rollback / down command.
> (2) Documentation exists for how to trigger a migration rollback.

This plan is kept tight to the two ACs (a **guarded rollback command** + **documentation**)
and the description's explicit boundary: *this story is the **database** leg only* — code
rollback and infra rollback are sibling stories in the broader procedure and are out of
scope here.

## Scope

**In scope**
1. A guarded `rollback` command on the `migrationRunner` Lambda (`src/migrationHandler.ts`).
2. A means to trigger it in any deployed environment (a manual `workflow_dispatch` GitHub Action) — satisfies **AC1**.
3. Unit tests for the new command (repo requires ≥90% coverage).
4. A rollback runbook — satisfies **AC2**.

**Explicitly out of scope** (do not build — separate concerns)
- Automatic rollback on deploy failure. Rollback is destructive; it stays **manual, human-triggered**.
- Code rollback and infra rollback (the other two legs named in the ticket).
- A full-history `rollback --all`. We roll back **the last batch only** (= one deploy), which
  is exactly what "roll back a failed deployment" means. Exposing all-batches invites catastrophe.
- Auditing/rewriting the existing `down()` functions — noted as a risk, not work for this story.
- Any change to the forward `migrate` path.

## Key design decisions

- **`rollback` maps to `knex.migrate.rollback(config, false)`** — undoes the most recent
  **batch**. Since every deploy applies exactly one batch, one rollback = reverse the last
  deploy. (Single-migration `down()` is deliberately not exposed; batch = deploy is the right unit.)
- **Guard = explicit confirmation in the payload.** Mirroring the existing `gc-dbs`/`drop-db`
  guard style, the command refuses to run unless `event.confirm === true`. This prevents an
  accidental/empty invocation from mutating a DB.
- **Reuses existing IAM — no foundation change.** The deployer role already grants
  `lambda:InvokeFunction` on `*-migrationRunner` (`terraform/modules/iam/role-deployer.tf`),
  added in PAY-355. The rollback workflow invokes the same function, so **no IAM/foundation
  apply is required**.
- **Prod trigger is gated by a protected GitHub Environment** (required reviewer), so a prod
  rollback needs a second human — cheap, strong guardrail.

## Work items

### 1. Handler — add the `rollback` command · `src/migrationHandler.ts`

- Add `"rollback"` to the `Command` union.
- Add `confirm?: boolean` to `MigrationHandlerEvent`.
- In the Knex-backed block (alongside `verify`/`seed`), add:

  ```ts
  if (command === "rollback") {
    if (event?.confirm !== true) {
      throw new Error(
        `rollback requires confirm:true — refusing to roll back the last batch on ` +
          `"${connection.database}" without explicit confirmation`,
      );
    }
    const [batchNo, migrations] = await knex.migrate.rollback(undefined, false);
    return { statusCode: 200, body: JSON.stringify({ batchNo, migrations }) };
  }
  ```

- Keep the existing `console.log(command=…, db=…)` line — it already logs the target DB for
  the CloudWatch audit trail. Return shape matches `migrate` (`{ batchNo, migrations }`) so
  tooling/logs stay uniform.

### 2. Trigger — manual rollback workflow · `.github/workflows/db-rollback.yml` (new)

Model directly on `.github/workflows/gc-pr-dbs.yml` (same OIDC + `aws lambda invoke` shape):

- `on: workflow_dispatch:` with inputs:
  - `environment` — choice `[dev, stg, prod]`.
  - `confirm` — free-text; the job asserts it equals the literal `rollback` (or the env name)
    before invoking, and fails fast otherwise. Fat-finger guard at the pipeline layer.
- Job:
  - `environment: ${{ inputs.environment }}` → map `prod` to a **protected** GitHub Environment
    (required reviewer).
  - Configure AWS creds via the env-appropriate `*_AWS_DEPLOYER_ROLE_ARN` secret.
  - Resolve the function name with `terraform output -raw migration_runner_function_name` in
    `terraform/environments/${{ inputs.environment }}/` (same mechanism the deploy workflows use)
    — avoids hardcoding names per env.
  - Invoke:

    ```bash
    aws lambda invoke --function-name "$FN" \
      --payload '{"command":"rollback","confirm":true}' \
      --cli-binary-format raw-in-base64-out \
      --log-type Tail --cli-read-timeout 130 response.json
    ```

  - Reuse the deploy workflow's `jq -e '.FunctionError'` check + `cat response.json` so a failed
    rollback fails the job.

This delivers **AC1**: a repeatable, guarded, environment-scoped trigger.

### 3. Tests · `src/migrationHandler.test.ts`

Follow the existing mock structure:
- Add `mockRollback = jest.fn().mockResolvedValue([3, ["20260629120000_add_processing_transaction_status"]])`
  and include `rollback: mockRollback` in the mocked `migrate` object.
- Cases:
  1. `command:"rollback", confirm:true` → calls `knex.migrate.rollback`, returns 200 with
     `{ batchNo, migrations }`, and `destroy()` is called.
  2. `command:"rollback"` **without** `confirm` → throws the guard error, `rollback` **not** called.
- Confirms both the happy path and the guardrail; keeps coverage ≥90%.

### 4. Documentation · `docs/db-migration-rollback.md` (new) — **AC2**

Precise runbook, no fluff:
- **Decision rule:** fix-forward is the default; rollback is **break-glass** for a failed deploy.
- **How to trigger:** step-by-step for the `db-rollback.yml` `workflow_dispatch` (select env, type
  `confirm`), plus the raw `aws lambda invoke` one-liner for a true break-glass moment.
- **What it does / returns:** reverses the last batch (= last deploy) via each migration's `down()`;
  returns the rolled-back list.
- **Caveats (call out plainly):** `down()` can lose data (dropped columns/tables); `down()` paths
  are lightly exercised; partial-batch nuance; the `knex_migrations_lock` and stale-lock recovery.
- **Backstop:** RDS point-in-time restore for data-level catastrophes (reference only — not this story).

Link it from wherever the docs index / README lists runbooks.

## Guardrails summary (defense in depth)

| Layer | Guard |
|---|---|
| Payload | `confirm:true` required or the Lambda throws |
| Workflow input | `confirm` text must match before invoking |
| Prod | protected GitHub Environment → required reviewer |
| Scope | last batch only; no all-history rollback exposed |
| Access | not on API Gateway; invoke limited to the deployer role |

## Risks & dependencies (flag in the PR, do not solve here)

- **Rollback is only as safe as the `down()` functions.** All 8 migrations define `down()`, but
  they're rarely executed against real data. Recommend a **follow-up ticket** to test `down()`
  paths — out of scope for PAY-356, but worth a note so nobody assumes rollback is risk-free.
- **Data loss is inherent** to schema rollback; the docs must make that unambiguous so it isn't
  used casually in place of fix-forward.

## Sequencing / estimate

1. Handler command + unit tests (½ day)
2. `db-rollback.yml` workflow + dev dry-run (½ day)
3. Runbook doc (¼ day)
4. PR + verify on dev (invoke a real rollback of a throwaway migration on dev) (¼ day)

~**1.5 days**, single PR. No infra/IAM/foundation changes required.

## Open decisions to confirm before build

- **(a)** last-batch-only rollback vs. also exposing a single-step `down` — recommend last-batch-only.
- **(b)** whether prod rollback should require a protected-Environment reviewer — recommend yes.
