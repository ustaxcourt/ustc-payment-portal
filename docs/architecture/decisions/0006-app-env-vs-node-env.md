# 6. Separate `APP_ENV` (deployment topology) from `NODE_ENV` (Node runtime)

Date: 2026-04-29

## Status

Accepted

## Context

The codebase historically overloaded `NODE_ENV` to encode our deployment topology, with values like `local` and `staging` alongside the standard `development` / `production` / `test`. Using `NODE_ENV` for application-level deployment routing is a well-known anti-pattern:

- `NODE_ENV` is a Node runtime concern. Node, Express, knex, Jest, and most build tools branch on three legal values only: `development`, `production`, `test`. Setting a fourth value (e.g. `staging`) silently puts those libraries into "non-production" mode — for example, Express enables verbose error pages, view-template caching is disabled, and dev-only middleware paths activate.
- Conflating the two concerns makes it impossible to express "this Lambda runs in our staging deployment, but should otherwise behave like production." Before this change, our stg Lambdas had `NODE_ENV=staging`, which meant `NODE_ENV !== 'production'` evaluated `true` and any code path gated on that ran the dev/non-prod branch in stg.
- The on-disk `.env.<env>` filenames already encoded *deployment* (e.g. `.env.dev`), not *Node mode*, so the README description ("envs live at `.env.<NODE_ENV>`") was already inconsistent with reality.

The two concerns we need to distinguish:

1. **Node runtime mode** — what Node, Express, Jest, knex, and friends should do.
2. **Deployment topology** — which AWS environment we are running in, which secrets to load, whether to expose dev-only routes, whether to bypass auth.

## Decision

We split the two concerns into two environment variables with non-overlapping value spaces:

| Variable | Purpose | Values | Consumers |
|---|---|---|---|
| `NODE_ENV` | Node runtime mode | `development \| production \| test` | Node, Express, knex, Jest, build tooling |
| `APP_ENV` | Deployment topology | `local \| dev \| stg \| prod \| test` | Our own application code only |

Rules going forward:

1. **`NODE_ENV` is for the Node runtime, period.** Use it where Node, Express, libraries, or build tooling consume it (test framework, knex pool sizing, dev-only middleware) — nowhere else. Do not branch our code on `NODE_ENV`.
2. **Use `APP_ENV` for deployment-topology branches.** Cert selection, auth bypass, dev-only route gating, environment-specific URLs, etc.
3. **Read `APP_ENV` through the typed accessor** (`src/config/appEnv.ts`): `getAppEnv()`, `isLocal()`, `isDeployed()`. The accessor validates the value at startup and throws on unknown input.
4. **`NODE_ENV` is narrowed in `src/types/environment.d.ts`** to `"development" | "production" | "test"`. The TypeScript compiler will reject any string equality with `"local"` or `"staging"` — that is the enforcement mechanism that prevents the anti-pattern from creeping back.
5. **`LOCAL_DEV=true` remains the SigV4-bypass flag** for now (used by `extractCallerArn` and `permissionsClient`). It is semantically the same concept as `APP_ENV=local` and should be folded into the accessor in a follow-up. Until then, do not invent additional flags for "am I running locally?".

The Terraform Lambda envs set both `NODE_ENV` and `APP_ENV` per deployment:

- `dev`: `NODE_ENV=development`, `APP_ENV=dev`
- `stg`: `NODE_ENV=production`, `APP_ENV=stg`
- `prod`: `NODE_ENV=production`, `APP_ENV=prod`

Stg moves from `NODE_ENV=staging` to `NODE_ENV=production` because we want stg Lambdas to behave like prod at the Node-runtime level (no dev middleware, no verbose errors). The deployment-topology distinction is now carried by `APP_ENV=stg`.

Local dev uses `NODE_ENV=development` and `APP_ENV=local`. Jest sets `NODE_ENV=test` automatically; the `APP_ENV` accessor treats unset `APP_ENV` with `NODE_ENV=test` as `APP_ENV=test` so unit tests do not have to set both.

## Consequences

- **Type system enforcement.** Adding a new deployment topology means adding a value to the `APP_ENV` union; it does not require touching `NODE_ENV`. Any future attempt to write `process.env.NODE_ENV === "staging"` is a compile error.
- **Behavior change in stg.** Previously, any code branching on `NODE_ENV !== "production"` ran in stg as if it were dev. After this change, stg behaves like prod at the Node-runtime layer. The `/migrations` route on `devServer.ts`, which was gated on `NODE_ENV !== "production"`, is now gated on `APP_ENV === "local"`, so it is no longer reachable in any deployed environment. (In practice `devServer.ts` was never bundled into a Lambda, so the gate was already only meaningful locally — but the gate now matches the comment that already promised local-only.)
- **Operational consistency.** Lambda env vars now match the Terraform `local.environment` value one-for-one (`dev` ↔ `dev`, `stg` ↔ `stg`, `prod` ↔ `prod`). No translation step.
- **Migration surface.** All call sites that previously read `process.env.NODE_ENV` for deployment routing have been migrated to `getAppEnv()` / `isLocal()` / `isDeployed()`. CI grep gates verify no new violations creep in.
- **Known follow-up.** `LOCAL_DEV` should be folded into `APP_ENV=local` in a follow-up ticket. It was not consolidated here because it gates auth-critical SigV4 bypass; expanding the blast radius of PAY-257 into security-sensitive paths was not justified.

## References

- Implementation plan: [docs/PAY-257-plan.md](../../PAY-257-plan.md)
- Typed accessor: [src/config/appEnv.ts](../../../src/config/appEnv.ts)
- `NODE_ENV` type narrowing: [src/types/environment.d.ts](../../../src/types/environment.d.ts)
