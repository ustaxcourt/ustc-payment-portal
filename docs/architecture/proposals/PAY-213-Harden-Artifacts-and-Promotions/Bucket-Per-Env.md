# Artifact Bucket Per Environment Approach (The Bucket Chain)

In this approach, we would add two additional buckets. One for Stg, and One for Prod. Artifacts are built in GitHub and stored as GH Actions artifacts. When Dev is deployed, the artifact is pulled from GH Actions and uploaded to the Dev bucket. When Stg is deployed, the artifact is also pulled from GH Actions and uploaded to the Stg bucket — Stg never touches the Dev bucket. From there, Prod copies directly from Stg. **The enforced freeze point is Stg → Prod.** Dev → Stg stays loose, which lets Dev iterate fast and avoids a cross-account trust edge between the Dev and Stg accounts. Prod never depends on the Dev account at deploy time.

## Security

The primary benefit is blast radius control. If a bad actor were to get access to our AWS Dev Account, that only exposes the Dev artifact bucket and the hosted Dev version of Payment Portal — it gives them **no access** to Stg or Prod. GH Actions needs `s3:PutObject` on the Dev bucket and the Stg bucket to upload artifacts to each. There is only **one cross-account trust edge**: the Prod deployer role needs `s3:GetObject` on the Stg bucket, scoped to the `artifacts/stg/*` prefix. The Dev account has zero relationship with Stg or Prod at deploy time. We don't need list permission since we can determine artifact names via their deterministic pattern: `artifacts/<env>/<SHA>/<funcname>.zip`.

## Reliability/Single Point of Failure

Individual buckets for each environment act as a natural cache, giving us a window of the most recent validated builds that we can rollback to in the event of emergency. Once an artifact gets stored in the bucket, we are no longer dependent on the previous environment nor GitHub. The Dev account is fully isolated — an outage or misconfiguration there has no impact on Stg or Prod's ability to deploy.

## Cost

Going by the zip sizes in the Dev bucket, per function each zip is about **100 KB**. Pretending for a moment that we are a much larger API, lets say 10 lambda functions at **100 KB** each, that's about **1 MB** per build. At **$0.023 per GB** for s3 with a 10 artifacts stored, we would be looking at **$0.00023** per month. Call it **$0.00069** total per month for all 3 buckets, storing 10 artifacts each at any given moment.

`10 Artifacts x 1 MB per Artifact = 10 MB Total x 3 buckets @ $0.00023 Per Month = $0.00069 per month`

## Operational Integrity

Using S3's built in hash check, we can calculate an Artifact's SHA256 before uploading to Dev and Stg, and re-check the hash when Prod copies from Stg. The freeze happens at Stg — once an artifact lands in the Stg bucket, Object Lock prevents it from being modified or deleted. Prod ships those exact frozen bytes. Dev stays mutable to allow fast iteration. If the SHA256 doesn't match at any step, the artifact is rejected by S3 (`BadDigest` error) and the current deployed artifact remains in place. The chain of custody proof runs from GH → Stg → Prod via `x-amz-checksum-sha256`.

**Object Lock mode and retention:** We recommend **GOVERNANCE** mode rather than COMPLIANCE. COMPLIANCE mode prevents deletion by anyone, including root and lifecycle rules, until the retention period expires. This would block artifact pruning entirely, causing unbounded storage growth and breaking the 10-artifact cost estimate. GOVERNANCE mode still protects against accidental deletion but allows a designated IAM role with `s3:BypassGovernanceRetention` to delete objects when needed (e.g., lifecycle cleanup after the rollback window closes). A retention period of **30 days** is a reasonable starting point, long enough to cover any realistic rollback scenario, short enough to keep storage bounded. This should be reconciled against the team's stated rollback window before implementation.

## Migration Plan

1. **Create Stg and Prod artifact buckets (Terraform)** — add a new `artifacts_bucket` module instance in `terraform/environments/stg` and `terraform/environments/prod`. Enable versioning and encryption. Object Lock must be configured at bucket creation, it cannot be enabled on an existing bucket. The current `artifacts_bucket` module has no Object Lock support and will need two additions: `object_lock_enabled = true` on the `aws_s3_bucket` resource, and a new `aws_s3_bucket_object_lock_configuration` resource to set the default retention rule. **The Dev bucket is exempt.**

2. **Save Lambda ZIPs as a GH artifact on merge to main** — the `pr_build_test_deploy` job is unchanged; ephemeral PR artifacts go to S3 only for the ephemeral Terraform environment and are not saved to GH. Add a step to `deploy_dev` (after the ZIPs are in hand — either from the S3 PR prefix or a fresh build at the merge SHA) that uploads them as a named GH artifact (e.g. `lambda-zips-<sha>`) before writing to the dev S3 bucket. This is the canonical save point for the promotion chain.

3. **Update the dev deploy job** — replace the `promote_artifacts_s3.sh` call (which currently copies PR→dev within the same bucket) with: download from GH artifact, upload to the dev bucket using `--checksum-algorithm sha256`. After upload, fetch `x-amz-checksum-sha256` via `HeadObject` and assert it matches the hash computed in step 2. Store the GH run ID in the dev git tag annotation for traceability.

4. **Update `staging-deploy.yml`** — instead of copying from the dev bucket, read the GH run ID from the dev git tag annotation and use `actions/download-artifact` to pull the ZIPs directly from GH. Upload to the stg bucket with `--checksum-algorithm sha256` and verify the hash. Object Lock retention is applied on landing. Change `TF_VAR_artifact_bucket` to the stg bucket. If we are using the s3 CLI, computing the hash and checking it when it arrives on the account is handled automatically.

5. **Update `prod-deploy.yml`** — copy from the stg bucket → prod bucket with checksum re-verification. Object Lock retention applied on landing. Point Terraform at the prod bucket.
  - `Stg` needs to permit access on its policy, and Prod's deployer role will need to also allow `s3:GetObject` on the stg bucket.

6. **Update IAM** — GH Actions OIDC needs `s3:PutObject` on the dev bucket (already exists) and the stg bucket (new). Grant the prod deployer role cross-account `s3:GetObject` on the stg bucket scoped to `artifacts/stg/*`. No cross-account trust between Dev and Stg accounts is needed.

7. **Remove old cross-account permissions** — the dev bucket policy in `terraform/modules/artifacts_bucket/main.tf` currently grants stg and prod read access via six existing Sids. Once both environments are confirmed working from their own buckets, remove all six from the Terraform: `AllowStagingDeployerListDevPrefix`, `AllowStagingDeployerGetBucketLocation`, `AllowStagingDeployerGetDevObjects`, `AllowProdDeployerListDevPrefix`, `AllowProdDeployerGetBucketLocation`, and `AllowProdDeployerGetDevObjects`. Also remove `var.staging_deployer_role_arn` and `var.prod_deployer_role_arn` from the module variables if no longer referenced.

## Rollback Plan

**Where possible, we prefer to roll forward to fix issues.**

1. Confirm the issue, and see if it can be fixed as a **fail-forward** case.

### Pre-rollback Checklist
- Assign incident owner and create a JIRA ticket to track the incident.
- Retrieve the currently hosted commit SHA and the planned rollback commit SHA.
- Run `Terraform Plan` comparing the two hashes.
- Verify if there were any changes to the artifact bucket (there shouldn't be after we set this up the first time)
- Hard pause on new promotions if rollback is happening on **Stg** or **Prod**. (Notify team)

2. If the fix requires significant changes and/or testing, proceed with rollback procedures. We will keep at a minimum of 1 **last known good artifact** to rollback to in each artifact bucket. (Include the ability to manually define a SHA + run ID as a parameter, if it's in the env's bucket already we deploy it.) We may be able to include this in the deploy scripts, or have a separate script defined for rollback. **The rollback artifact has to exist in the environment's bucket, otherwise it will need to be redeployed from GitHub**.

### Rollback Verification Checklist
- Confirm Deployment success.
- If deploying to **Prod**, confirm that it successfully deployed and passed on **Stg** first.

