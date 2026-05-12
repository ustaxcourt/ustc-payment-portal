---
"@ustaxcourt/payment-portal": patch
---

PAY-257: Separate `NODE_ENV` (Node runtime) from `APP_ENV` (deployment topology).

`NODE_ENV` is restricted to `development | production | test`. A new `APP_ENV` variable (`local | dev | stg | prod | test`) drives all deployment-topology branching in our code, read via the typed accessor in `src/config/appEnv.ts` (`getAppEnv()`, `isLocal()`, `isDeployed()`). TypeScript now rejects any string equality between `NODE_ENV` and disallowed values like `"local"` or `"staging"`.

Notable behavior change: stg Lambdas now run with `NODE_ENV=production` (previously `staging`) so they behave like prod at the Node-runtime layer (no verbose Express errors, no dev-only middleware). The deployment-topology distinction is carried by `APP_ENV=stg`.

Deployment: all deployed Lambdas now require `APP_ENV` in their environment block — Terraform updates in this PR provide it for dev/stg/prod. Local developers must update their `.env` files: `NODE_ENV="local"` is no longer valid; use `NODE_ENV="development"` + `APP_ENV="local"`.

See [ADR 0007](docs/architecture/decisions/0007-app-env-vs-node-env.md) for full rationale.
