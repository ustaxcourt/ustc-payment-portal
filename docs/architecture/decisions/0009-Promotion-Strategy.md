# 9. Choosing a Promotion Strategy

Date: 2026-06-23

## Status

Accepted

## Context

Our current promotion workflow to Stg and Prod is defunct. We only support pushing artifacts to hosted `dev` at the moment. All 3 environments pull from the same artifacts bucket in `dev`. We need an artifact deployment strategy that supports all 3 environments, while maintaining the isolation and security we need for prod. There were 3 options that we considered:

1. GH Checkout Build, Artifacts deployed to **Dev** and **Stg** separately, with artifacts being promoted to **Prod** required to be tested first in **Stg**. (GitHub never touches Prod)
2. All 3 environments get artifacts directly from GitHub.
3. GH Checkout Build -> Artifact copied to Dev -> Artifact copied from Dev to Stg -> Artifact copied from Stg to Prod.

## Decision

The team met on June 23rd, 2026 and accepted option 1 as our promotion strategy, with option 3 as our fallback.

Option 1 gives us flexibility to continue to use **Dev** as a testbed, without risking affecting **Stg and Prod**. We also still get the benefit of placing **Stg** in front of **Prod** to protect against un-validated artifacts getting deployed.

## Consequences

- **Added complexity** Compared to just deploying to Dev currently, this will bring back deployments to Stg and Prod as a part of our process.
- **Stg gates Prod** Artifacts will need to pass tests in Stg pointed at QA Pay.gov env before going into Prod.
- **No single chain-of-custody** At a minimum we would only know that something ran in Stg before Prod. Any assumptions that it ran in Dev would be done by process (typically any new commits would be tested in Dev first anyway).
- **Security Posture** If the Dev account gets compromised, it will no longer affect Stg or Prod level artifacts. We will also lock artifacts going from Stg to Prod (they can't be deleted or overwritten).
- **Structural Changes** We will need two new buckets (and associated Terraform), and `s3:PutObject` added to the existing Stg deployer role (`STAGING_AWS_DEPLOYER_ROLE_ARN`) to allow GH Actions to upload artifacts to the Stg bucket. No new OIDC trust role is needed — the provider already exists in the Stg account.

**See [Proposal](../proposals/PAY-213-Harden-Artifacts-and-Promotions/Bucket-Per-Env.md) for more details and migration plan.**
