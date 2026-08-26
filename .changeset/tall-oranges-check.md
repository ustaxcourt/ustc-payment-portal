---
"@ustaxcourt/payment-portal": patch
---

Update package metadata dependencies and regenerate the npm lockfile.

- Bump the AWS SDK packages used by the app and Lambda tooling: `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ssm`, `@aws-sdk/client-sts`, and `@aws-sdk/client-lambda`.
- Refresh supporting tooling dependencies, including `@biomejs/biome` and `js-yaml`, and capture the resulting transitive updates in `package-lock.json`.
- Bump to `changesets/action@v2` to account for updating the `@changesets/cli` package from `v2` to `v3` in a previous update branch. Updated documentation to account for the changeset update.
