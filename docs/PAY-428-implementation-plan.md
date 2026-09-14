# PAY-428 — Only run migration and Terraform checks when necessary — Implementation Plan

> **Story:** As a developer on the payment portal, so that I'm not waiting on checks that
> have nothing to do with my change, I need the migration check and the Terraform
> validate/plan checks to run only when a PR actually touches migrations or Terraform.
>
> **AC1:** A PR touching no migrations and no Terraform runs neither check, and can still be
> merged (not left waiting on a check that never reports).
> **AC2:** A PR touching Terraform still runs validate and plan for all three envs, and still
> posts the plan comment.
> **AC3:** A PR touching migrations still runs the migration check, and still fails when a
> migration is broken.

## Approach

Three workflows change. They are **not** the same filter applied three times:

| Workflow | Question it asks | Filter shape |
| --- | --- | --- |
| `terraform-plan.yml` | Did Terraform change? | Allowlist — run only on a match |
| `ci.yml` (`migration-check`) | Did `db/` or its config change? | Allowlist — run only on a match |
| `cicd-dev.yml` | Does this PR change runtime behavior *at all*? | **Denylist** — skip only for docs-only PRs |

`cicd-dev.yml` is in scope because it is the dominant cost: `pr_build_test_deploy` has no
path filter, so every PR gets a full ephemeral Terraform apply (45-min timeout). Fixing only
the two checks named in the ticket would satisfy the ACs while leaving most of the wait.

**It must not be filtered on "did Terraform change."** The ephemeral environment is how the
PR's Lambda code gets under test — `integration_test` runs against
`needs.pr_build_test_deploy.outputs.api_url`. A PR changing only `src/handlers/*.ts` touches
no Terraform but still needs the deploy, or its integration tests run against stale code.
Hence the denylist: an unrecognised path counts as *needing* an environment, so a forgotten
entry costs a wasted deploy rather than untested code.

## Detection method

One primitive everywhere — a path-filtered git diff as a boolean job output, gating the
expensive job. Same technique `migration-safety-pr.yml` already uses (PAY-353).

**Three dots, not two.** `git diff A...B` means "diff from `merge-base(A, B)` to `B`" — what
B changed *since it diverged from A*. Two dots would also report changes that landed on
`main` after the branch forked, so a teammate's migration would falsely trigger your check.

Deliberately **not** used:

- **Workflow-level `paths:` filters** — the trap AC1 warns about. A workflow that never
  triggers never reports, leaving a required check stuck on "expected". Every condition here
  is at *job* level so the workflow always runs.
- **`dorny/paths-filter`** — not used anywhere in `.github/workflows/` today, and AGENTS.md
  says to pin to versions already present. Hand-rolled `git diff` costs six lines.

## Path lists

The ticket proposes `db/` + `knexfile.ts` and `terraform/`, and asks for confirmation during
implementation. Both need widening.

### Allowlists — the check runs when any of these changed

**`migration-check`**

| Path | Why it triggers the check |
| --- | --- |
| `db/` | Migrations **and seeds** — the check runs `seed:run` too. |
| `knexfile.ts` | Knex entrypoint the CLI reads. |
| `src/db/knexConfig.ts` | Where the real config lives; `knexfile.ts` is a 4-line shim over it. Omit this and a change breaking connection setup merges green. |
| `package-lock.json` | A knex or pg bump changes migration behavior. |
| `.github/workflows/ci.yml` | Editing the check must re-run the check. |
| `src/config/`, `src/schemas/`, `src/errors/`, `src/utils/` | **The seeds import from `src/`** — see below. |

#### Why `src/` appears in a migration trigger list

`db/migrations/` imports nothing but `knex`, so `migrate:latest` and `migrate:rollback` cannot
be broken by application code. But `migration-check` also runs `seed:run`, and `db/seeds/`
reaches into `src/`:

```
src/config/fees                 (getActiveFee, staticFees)
src/config/payGovReturnCodes    (getAllReturnCodes)
src/schemas/FeeKey.schema
src/schemas/PaymentStatus.schema
src/schemas/TransactionStatus.schema
src/utils/generateTrackingId
  └─ fees.ts further imports src/errors/feeConfiguration, src/errors/feeNotFound
```

Nothing else catches a break here. `tsconfig.json` is `"include": ["./src/**/*"]` and
`tsconfig.test-types.json` is `"include": ["./test-types/**/*"]` — **`db/` is never
type-checked**. So a change to `src/config/fees.ts` that breaks the seeds is invisible to
`npm run tsc`, `test:types` and the unit suite. It is caught today only because
`migration-check` runs on every push. Omit these paths and the break lands on `main`, then
surfaces on the next unrelated PR that happens to touch `db/`.

Directories rather than the eight exact files, so the list does not silently rot when someone
adds an import. This is deliberately generous — `migration-check` is a Postgres container and
three knex commands (~2 min), where the ephemeral deploy is 45. Even widened it still skips
`src/handlers/`, `src/useCases/`, `src/clients/`, tests, docs and `terraform/`.

**`terraform plan`**

| Path | Why it triggers the check |
| --- | --- |
| `terraform/` | Modules and per-env config. This is the whole list. |

`.github/workflows/terraform-plan.yml` is deliberately **not** a trigger, unlike `ci.yml` in
the migration list. The two checks have different cost profiles: `migration-check` is one
Postgres container and three knex commands (~2 min), so triggering it generously is cheap,
whereas `terraform plan` is three parallel AWS role assumptions across three accounts. Most
of the workflow file is also presentation — roughly 90 lines of bash in the `comment` job
(`read_field`, `icon_for`, `truncate_plan`, the markdown builder) whose behavior has no
bearing on whether Terraform is valid. And the workflow never applies anything; apply is
owned by the deploy workflows.

The `TF_VAR_*` entries in its `env:` block are not a reason either — every `_s3_key` variable
declares `default = ""`, and the workflow already sets only 6 of the 13 without issue, so they
are not load-bearing.

> **Residual risk, accepted:** a PR that bumps `terraform_version`, edits the matrix, or
> changes init/plan flags *without* touching `terraform/` is not validated until the next PR
> that does — and that person sees a red gate for someone else's change. Rare, self-evident
> when it happens, and nothing is deployed meanwhile. There is no `workflow_dispatch` on this
> workflow, so the practical mitigation is to include a trivial `terraform/` edit in any PR
> that changes how the plan itself runs.

### Denylist — the ephemeral deploy is skipped only when *every* changed file matches

| Path | Why it is safe to skip |
| --- | --- |
| `docs/` | Documentation only; no runtime effect. |
| `.changeset/` | Release notes consumed at publish time, not by the running service. |
| `*.md` | Includes root files — `README.md`, `AGENTS.md`, `running-locally.md`. |
| `LICENSE` | Not code. |

Note the inversion: the two tables above list paths that **start** work, this one lists paths
that **permit skipping** it. A path absent from this list means "deploy" — so forgetting an
entry costs a wasted deploy, never an untested one.

## 1. `ci.yml`

`ci.yml` triggers on `push: branches: "**"`, so there is no `base.sha` and
`github.event.before` is unreliable (all-zeros on a branch's first push, wrong after a
force-push). Resolve the fork point with git instead.

```yaml
  changes:
    name: Detect changed paths
    runs-on: ubuntu-latest
    outputs:
      migrations: ${{ steps.detect.outputs.migrations }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0        # full history so merge-base resolves
      - id: detect
        run: |
          set -euo pipefail
          # src/config, src/schemas, src/errors, src/utils are here because db/seeds/
          # imports from them and db/ is not covered by tsc. See the path-list section.
          # An array, not a string: "${PATHS[@]}" avoids relying on word-splitting.
          PATHS=(
            db/ knexfile.ts src/db/knexConfig.ts package-lock.json
            src/config/ src/schemas/ src/errors/ src/utils/
            .github/workflows/ci.yml
          )
          # On main, merge-base with itself is HEAD, so the three-dot range would be empty
          # and the check would never run. Use the previous commit instead — on a PR merge
          # commit HEAD^ is main's prior tip, which is what we want.
          if [ "$GITHUB_REF" = "refs/heads/main" ]; then BASE="HEAD^"; else BASE="origin/main"; fi
          if git diff --name-only "$BASE...HEAD" -- "${PATHS[@]}" | grep -q .; then
            CHANGED=true
          else
            CHANGED=false
          fi
          echo "migrations=$CHANGED" >> "$GITHUB_OUTPUT"
          echo "Migration-related files changed: $CHANGED"
```

```diff
   migration-check:
-    needs: build
+    needs: [build, changes]
+    if: needs.changes.outputs.migrations == 'true'
     # services, env and steps unchanged
```

```yaml
  migration-check-gate:
    name: Migration Check Gate
    needs: [changes, migration-check]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Require the migration check to have passed
        env:
          CHANGES_RESULT: ${{ needs.changes.result }}
          MIGRATIONS: ${{ needs.changes.outputs.migrations }}
          CHECK_RESULT: ${{ needs['migration-check'].result }}
        run: |
          set -euo pipefail
          if [ "$CHANGES_RESULT" != "success" ]; then
            echo "::error::Could not determine whether migrations changed (changes job: $CHANGES_RESULT)."
            exit 1
          fi
          if [ "$MIGRATIONS" != "true" ]; then
            echo "No migration-related changes in this push — nothing to check."
            exit 0
          fi
          if [ "$CHECK_RESULT" = "success" ]; then
            echo "Migration check passed."
            exit 0
          fi
          echo "::error::Migration check did not pass (result='$CHECK_RESULT')."
          exit 1
```

> **Gotcha:** the job id has a hyphen, and GitHub's expression parser reads
> `needs.migration-check.result` as *subtraction*. It must be
> `needs['migration-check'].result`.

If `build` fails, `migration-check` is skipped and the gate fails when migrations changed —
correct, we cannot claim the migrations are fine.

## 2. `terraform-plan.yml`

Already on `pull_request`, so `base.sha` is available and the detect job copies
`migration-safety-pr.yml` verbatim.

```yaml
  changes:
    name: Detect Terraform changes
    runs-on: ubuntu-latest
    outputs:
      terraform: ${{ steps.detect.outputs.terraform }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
      - id: detect
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          # terraform/ only — this workflow file is deliberately not a trigger.
          # See the path-list section for why (cost profile, and it never applies).
          PATHS=( terraform/ )
          if git diff --name-only "$BASE_SHA...$HEAD_SHA" -- "${PATHS[@]}" | grep -q .; then
            CHANGED=true
          else
            CHANGED=false
          fi
          echo "terraform=$CHANGED" >> "$GITHUB_OUTPUT"
          echo "Terraform files changed: $CHANGED"
```

```diff
   plan:
-    needs: check_actor
-    if: needs.check_actor.outputs.is_dependabot != 'true'
+    needs: [check_actor, changes]
+    if: needs.check_actor.outputs.is_dependabot != 'true' &&
+        needs.changes.outputs.terraform == 'true'

   comment:
-    needs: [check_actor, plan]
+    needs: [check_actor, changes, plan]
     if: ${{ always() && github.event.pull_request.number
             && needs.check_actor.outputs.is_dependabot != 'true'
+            && needs.changes.outputs.terraform == 'true' }}
```

The `comment` edit is not optional — its artifact-download fallbacks would otherwise post
"✗ error / job did not produce output" for all three envs on every non-Terraform PR.

```yaml
  terraform-plan-gate:
    name: Terraform Plan Gate
    needs: [check_actor, changes, plan]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Require the plan to have succeeded
        env:
          IS_DEPENDABOT: ${{ needs.check_actor.outputs.is_dependabot }}
          CHANGES_RESULT: ${{ needs.changes.result }}
          TERRAFORM: ${{ needs.changes.outputs.terraform }}
          PLAN_RESULT: ${{ needs.plan.result }}
        run: |
          set -euo pipefail
          if [ "$IS_DEPENDABOT" = "true" ]; then
            echo "Dependabot PR — exempt by policy. Passing."
            exit 0
          fi
          if [ "$CHANGES_RESULT" != "success" ]; then
            echo "::error::Could not determine whether Terraform changed (changes job: $CHANGES_RESULT)."
            exit 1
          fi
          if [ "$TERRAFORM" != "true" ]; then
            echo "No Terraform changes in this PR — nothing to plan."
            exit 0
          fi
          if [ "$PLAN_RESULT" = "success" ]; then
            echo "Terraform plan succeeded for all environments."
            exit 0
          fi
          echo "::error::Terraform plan did not succeed (result='$PLAN_RESULT'). See the PR comment."
          exit 1
```

`needs.plan.result` for a matrix job is `success` only when every leg succeeded, so one
failing env fails the gate — what AC2 wants.

**Known edge case:** the plan comment is sticky. A PR that adds a Terraform change (comment
posted) then removes it keeps the stale comment, since the comment job now skips.
Recommendation: **accept it** — rare, the comment carries its own SHA, and it self-corrects
on the next Terraform push.

## 3. `cicd-dev.yml` — highest impact

```yaml
  changes:
    name: Detect runtime-affecting changes
    runs-on: ubuntu-latest
    outputs:
      needs_env: ${{ steps.detect.outputs.needs_env }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
      - id: detect
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          # Fail safe: deploy unless EVERY changed file is documentation.
          # grep -qv succeeds as soon as one file does NOT match the safe list.
          SAFE='^(docs/|\.changeset/|\.github/ISSUE_TEMPLATE/|LICENSE$|.*\.md$)'
          if git diff --name-only "$BASE_SHA...$HEAD_SHA" | grep -qvE "$SAFE"; then
            NEEDS=true
          else
            NEEDS=false
          fi
          echo "needs_env=$NEEDS" >> "$GITHUB_OUTPUT"
          echo "PR needs an ephemeral environment: $NEEDS"
```

```diff
   pr_build_test_deploy:
-    needs: check_actor
+    needs: [check_actor, changes]
     if: github.event_name == 'pull_request'
         && github.event.action != 'closed'
         && needs.check_actor.outputs.is_dependabot != 'true'
+        && needs.changes.outputs.needs_env == 'true'
```

`integration_test` needs **no** edit — it already declares
`needs: [check_actor, pr_build_test_deploy]`, and a job whose dependency is skipped is
skipped too.

Skipping lint and unit tests here is safe: they run inside `pr_build_test_deploy`, but
`ci.yml` runs lint, build, `test:types` and the unit suite on every push to every branch.
The two workflows already duplicate that work.

**`integration_gate` rewrite — this is what makes or breaks AC1.** It currently fails on
anything that is not `success`, so a skipped `integration_test` reports `skipped` and blocks
the PR. Left untouched, every docs-only PR becomes unmergeable.

```diff
   integration_gate:
-    needs: [check_actor, integration_test]
+    needs: [check_actor, changes, integration_test]
     # if: unchanged
     steps:
       - name: Require integration tests to have passed
         env:
           TESTS_RESULT: ${{ needs.integration_test.result }}
           IS_DEPENDABOT: ${{ needs.check_actor.outputs.is_dependabot }}
+          CHANGES_RESULT: ${{ needs.changes.result }}
+          NEEDS_ENV: ${{ needs.changes.outputs.needs_env }}
         run: |
           if [ "$IS_DEPENDABOT" = "true" ]; then
             echo "Dependabot PR — exempt from the integration gate by policy. Passing."
             exit 0
           fi
+          if [ "$CHANGES_RESULT" != "success" ]; then
+            echo "::error::Could not determine whether this PR affects runtime (changes job: $CHANGES_RESULT)."
+            exit 1
+          fi
+          if [ "$NEEDS_ENV" != "true" ]; then
+            echo "Documentation-only PR — no ephemeral environment, nothing to test. Passing."
+            exit 0
+          fi
           if [ "$TESTS_RESULT" = "success" ]; then
             echo "Integration tests passed — merge permitted."
             exit 0
           fi
           echo "::error::Integration Gate FAILED — integration_test did not succeed (result='$TESTS_RESULT')."
           exit 1
```

> **Confirm the safe list before merging.** `*.md` deliberately catches root files like
> `README.md`, `AGENTS.md` and `running-locally.md`. Narrowing it only costs occasional
> unnecessary deploys.

## 4. Branch protection (manual)

Not carryable by a PR — a ruleset change in GitHub settings, done *after* the gates have run
once so the check names exist.

| Action | Check |
| --- | --- |
| Add | `Migration Check Gate`, `Terraform Plan Gate` |
| Remove | `migration-check`, `Plan (dev)`, `Plan (stg)`, `Plan (prod)` |

`Integration Gate` keeps its name and stays required — only its internals changed.

`cicd-dev.yml` names the ruleset as `main-tests`; confirm whether the migration and plan
checks live there or in a separate one. Some may not be required today, in which case there
is nothing to remove.

> **Order matters.** The comment above `integration_gate` reads: *"a skipped required job
> would leave the PR stuck on 'expected'."* Treat that as the operating assumption — it is
> why every conditional job sits behind an always-running gate, and why **no
> currently-required check may become conditional until the ruleset has been repointed at
> its gate.**

## 5. Verification

One throwaway PR per case, all before the ruleset is updated.

| Case | Change | Expected |
| --- | --- | --- |
| **AC1** | `README.md` only | No Postgres, no `Plan (env)`, no plan comment, **no ephemeral environment**. All three gates green, nothing pending. |
| **AC1b** | `src/handlers/getDetailsHandler.ts` only | **Deploy still runs**, integration tests execute; `Plan (env)` and `migration-check` skip. If the deploy skips here the denylist is wrong and code ships untested. |
| **AC2** | `terraform/modules/api-gateway/main.tf` | All three `Plan (env)` run, unified comment posted, gate green. |
| **AC3** | A deliberately broken migration in `db/migrations/` | `migration-check` runs, fails on `migrate:latest`, gate red. Fix it, confirm green. |
| **Extra** | `src/db/knexConfig.ts` only | `migration-check` runs. Under the ticket's path list it would not — this is the case for widening it. |
| **Extra 2** | `src/config/fees.ts` only | `migration-check` runs, because `db/seeds/` imports it and `db/` is not type-checked. Without this trigger a seed break would land on `main` unnoticed. |

## 6. Execution

Eight phases. Phases 0–4 are reversible at any point; phase 6 onward changes repository
settings and has an ordering constraint — see phase 8.

### Phase 0 — Prep

- [ ] Branch from an up-to-date `main`:
      `git checkout main && git pull && git checkout -b feature/PAY-428-conditional-ci-checks`
- [ ] **Record what is required today.** You cannot safely remove check names in phase 7
      without this, and it is not recoverable afterwards:
      ```bash
      PAGER=cat gh api repos/{owner}/{repo}/rulesets --jq '.[] | {id, name}'
      PAGER=cat gh api repos/{owner}/{repo}/rulesets/<id> \
        --jq '.rules[] | select(.type=="required_status_checks")'
      ```
      Paste the output into the PR description. Expect `main-tests`; there may be a second
      ruleset holding `migration-check` and the `Plan (env)` names.
- [ ] Note a baseline: open a recent docs-only PR and record the wall-clock time of
      `pr_build_test_deploy`. This is the number phase 5 compares against.

### Phase 1 — `ci.yml`

- [ ] Add the `changes` job (section 1) above `build`, so the file reads detect → build →
      check → gate.
- [ ] **Dry-run the diff logic locally before committing** — this catches a wrong range or a
      typo'd path. **Run it under `bash`, not zsh** (see the warning below):
      ```bash
      bash <<'SH'
      PATHS=( db/ knexfile.ts src/db/knexConfig.ts package-lock.json \
              src/config/ src/schemas/ src/errors/ src/utils/ .github/workflows/ci.yml )
      git diff --name-only origin/main -- "${PATHS[@]}"
      SH
      ```
      On this branch it must list `.github/workflows/ci.yml`. With `-- src/handlers/` instead
      it must print nothing.

  > **Shell gotcha, found while implementing this.** zsh — the macOS default — does **not**
  > word-split unquoted parameter expansions, where bash does. So a space-separated
  > `PATHS="a b c"` passed as `-- $PATHS` becomes a *single* pathspec under zsh and silently
  > matches nothing. That reads as "no changes detected", which is a false negative in exactly
  > the situation you are trying to verify. The job itself is unaffected (GitHub Actions runs
  > `run:` blocks under bash), but the committed version uses a bash **array** with
  > `"${PATHS[@]}"` regardless, so the same snippet behaves identically in CI and locally.
- [ ] Add `needs: [build, changes]` and the `if:` to `migration-check`.
- [ ] Add the `migration-check-gate` job. Confirm you used
      `needs['migration-check'].result`, not the dotted form.

### Phase 2 — `terraform-plan.yml`

- [ ] Add the `changes` job (section 2). `PATHS="terraform/"` only.
- [ ] Add `changes` to `plan`'s `needs` and extend its `if:`.
- [ ] Add `changes` to `comment`'s `needs` and extend its `if:`. **Do not skip this** — the
      comment job would otherwise post a false failure on every non-Terraform PR.
- [ ] Add the `terraform-plan-gate` job.

### Phase 3 — `cicd-dev.yml`

- [ ] Add the `changes` job (section 3) with the denylist regex.
- [ ] Dry-run it locally against a docs-only range to confirm the regex inverts correctly:
      ```bash
      SAFE='^(docs/|\.changeset/|\.github/ISSUE_TEMPLATE/|LICENSE$|.*\.md$)'
      git diff --name-only origin/main...HEAD | grep -vE "$SAFE"   # non-empty ⇒ deploy
      ```
- [ ] Add `changes` to `pr_build_test_deploy`'s `needs` and extend its `if:`.
- [ ] Rewrite `integration_gate` per section 3. Leave `integration_test` alone.
- [ ] Re-read the rewritten gate once: a docs-only PR must reach an `exit 0`, not fall
      through to the failure branch.

### Phase 4 — Self-check on the implementation branch

- [ ] Push and open a draft PR. Expected on this branch specifically:
      - `migration-check` **runs** — `ci.yml` is in its own path list. Working as designed.
      - `Plan (env)` **skips** — no `terraform/` file was touched.
      - `pr_build_test_deploy` **runs** — `.yml` files are not in the docs denylist.
      - All three gates green.
- [ ] If any gate is red here, fix before proceeding. Do not start phase 5 on a red branch.

### Phase 5 — Verification PRs

- [ ] Run all five cases from section 5 as separate draft PRs off this branch. Close without
      merging.
- [ ] **AC1b is the one that must not be skipped** — it is the only case that proves the
      denylist did not over-match and start shipping untested code.
- [ ] Record AC1's `pr_build_test_deploy` result against the phase 0 baseline. It should be
      "skipped", not "faster".

### Phase 6 — Merge

- [ ] Mark ready, get review, merge to `main`.
- [ ] Confirm on the next unrelated PR that all three gate names now appear. GitHub cannot
      accept a check name into a ruleset until it has been seen at least once.

### Phase 7 — Ruleset (manual, in GitHub settings)

- [ ] **Add** `Migration Check Gate` and `Terraform Plan Gate` to required checks.
- [ ] Confirm a PR is still mergeable with both old and new names required — they coexist
      fine, since the old jobs still report `skipped` or green.
- [ ] **Remove** `migration-check`, `Plan (dev)`, `Plan (stg)`, `Plan (prod)`, using the
      phase 0 output to confirm exactly which existed.
- [ ] Leave `Integration Gate` alone — same name, same requirement, new internals.

### Phase 8 — Confirm, and how to back out

- [ ] Open one final docs-only PR. It must be mergeable with nothing stuck on "expected".
- [ ] Delete the verification branches.

> **Rollback ordering is the inverse of rollout.** After phase 7, reverting the merge first
> would delete the two gate jobs while the ruleset still requires those names — every PR then
> hangs on "expected" with no workflow able to satisfy it, and the fix requires settings
> access. **Always remove the gate names from the ruleset first, restore the old names, then
> revert the code.** Before phase 7, a plain revert is safe.

## Follow-up work (separate tickets)

- **The ephemeral apply is skipped, not made cheap.** Every PR that *does* need an
  environment still pays full price: the artifact key embeds the commit SHA
  (`artifacts/pr-<N>/<SHA>/<FUNC>.zip`), so `plan -detailed-exitcode` always returns `2` and
  the apply always fires, even for byte-identical code — publishing a new Lambda version and
  moving the `live` alias each time. A real fix needs content-addressed artifacts, which
  needs a reproducible zip first (`build-lambda.sh` does `rm -rf dist/`, so mtimes churn) and
  a rework of the four places parsing the `artifacts/pr-N/SHA/` path shape.
- **`db/` is not type-checked.** `tsconfig.json` includes only `./src/**/*`, so nothing
  type-checks the seeds — which import from `src/config`, `src/schemas` and `src/utils`.
  Adding `db/` to a tsconfig would catch signature breaks on every PR via the existing
  always-running `build` job, and would let migration-check's trigger list shrink back to
  `db/` and its own config. Runtime-only breaks (a fee key removed from `staticFees`, an
  `activationDate` moved into the future) would still need the seed run, so this narrows the
  gap rather than closing it.
- **Unpinned remote fetch in the Lambda build.** `build-lambda.sh` downloads the RDS CA
  bundle at build time with no pin and no checksum, into ten shipped artifacts.
- **`migration-check` overlaps the safety scan.** `checkMigrationSafety.ts` boots Knex and
  runs `migrate.latest()` against an identical `postgres:14` service, so both run every
  migration forward. `migration-check` uniquely adds `seed:run` and `migrate:rollback --all`.
