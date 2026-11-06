---
"@ustaxcourt/payment-portal": patch
---

Weekly dependency maintenance updates.

- Update AWS SDK packages:
  - `@aws-sdk/client-lambda` `^3.1156.0` → `^3.1162.0`
  - `@aws-sdk/client-secrets-manager` `^3.1156.0` → `^3.1162.0`
  - `@aws-sdk/client-ssm` `^3.1156.0` → `^3.1162.0`
  - `@aws-sdk/client-sts` `^3.1156.0` → `^3.1162.0`
- Update supporting libraries:
  - `fast-xml-parser` `^5.11.2` → `^5.12.0`
  - `@smithy/core` `^3.36.2` → `^3.39.0`
  - `@smithy/signature-v4` `^5.7.4` → `^5.7.5`
- Update development tooling:
  - `@biomejs/biome` `^2.6.2` → `^2.6.5`
  - `rimraf` `^6.1.3` → `^6.1.4`
- Refresh Terraform provider lockfiles and update locked provider versions, including `hashicorp/aws` `6.70.0` → `6.72.0`.

No application behavior or infrastructure configuration changes were made.
