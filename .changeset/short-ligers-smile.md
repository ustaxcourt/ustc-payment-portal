---
"@ustaxcourt/payment-portal": patch
---

Refresh dependency locks across the package and Terraform modules. Direct npm
updates include @aws-sdk/client-lambda, @aws-sdk/client-secrets-manager,
@aws-sdk/client-ssm, @aws-sdk/client-sts, @biomejs/biome, @playwright/test,
esbuild, js-yaml, pg, and tsx; package-lock was regenerated to
pick up the corresponding transitive updates. Terraform lockfiles were also
refreshed to move the hashicorp/aws provider from 6.56.0 to 6.58.0.
