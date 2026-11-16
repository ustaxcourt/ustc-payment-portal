---
"@ustaxcourt/payment-portal": patch
---

Refresh dependency locks. Direct npm updates include @aws-sdk/client-lambda,
@aws-sdk/client-secrets-manager, @aws-sdk/client-ssm, @aws-sdk/client-sts,
@smithy/core, @smithy/signature-v4, and @biomejs/biome; package-lock was
regenerated to pick up the corresponding transitive updates across the AWS SDK,
Smithy runtime, rollup platform binaries, and @babel/*. No range changes in
package.json and no major version bumps. No public API changes; routine
maintenance to keep the published package's dependencies current.

@changesets/cli 2.31.1 → 3.0.0 was deferred to its own ticket — it requires
moving changesets/action from v1 to v2 in the publish workflow. See
docs/dependency-caveats.md.
