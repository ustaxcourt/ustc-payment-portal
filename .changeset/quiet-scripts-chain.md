---
"@ustaxcourt/payment-portal": patch
---

Refresh npm dependencies. Direct updates, all within existing `package.json` ranges: @aws-sdk/client-lambda, @aws-sdk/client-secrets-manager, @aws-sdk/client-ssm and @aws-sdk/client-sts (3.1139.0 → 3.1145.0), @smithy/core, @smithy/signature-v4, @biomejs/biome, @types/aws-lambda, @types/node (24.x), dotenv, fast-xml-parser, pg and ts-jest. The lockfile was regenerated to pick up the corresponding transitive updates. No major version bumps.

Remove the `npm-run-all2` and `nodemon` dependencies, along with the `dev` and `dev:start` scripts and the unreferenced `runIntegration.sh`. `npm run dev` rebuilt and ran `node .`, which loads the package entry (exports only) and never started the Express server; use `npm run start:all` or `npm run start:dev-server` instead. `prepack` now chains `npm run` commands with `&&`. No public API changes.
