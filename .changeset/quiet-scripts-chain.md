---
"@ustaxcourt/payment-portal": patch
---

Refresh npm dependencies. Direct updates: @ustaxcourt/ustc-pay-gov-test-server (0.3.0 → 0.4.0, the one `package.json` range change), @aws-sdk/client-lambda, @aws-sdk/client-secrets-manager, @aws-sdk/client-ssm and @aws-sdk/client-sts (3.1139.0 → 3.1147.0), @smithy/core, @smithy/signature-v4, @biomejs/biome, @playwright/test, @types/aws-lambda, @types/node (24.x), dotenv, fast-xml-parser, js-yaml, pg, pino, pino-pretty and ts-jest. The rest are within existing `package.json` ranges. The lockfile was regenerated to pick up the corresponding transitive updates. No major version bumps.

Remove the `npm-run-all2` and `nodemon` dependencies, along with the `dev` and `dev:start` scripts and the unreferenced `runIntegration.sh`. `npm run dev` rebuilt and ran `node .`, which loads the package entry (exports only) and never started the Express server; use `npm run start:all` or `npm run start:dev-server` instead. `prepack` now chains `npm run` commands with `&&`. Dropping `nodemon` (also via the test server 0.4.0 upgrade) clears the `braces` advisory from the production dependency tree. No public API changes.
