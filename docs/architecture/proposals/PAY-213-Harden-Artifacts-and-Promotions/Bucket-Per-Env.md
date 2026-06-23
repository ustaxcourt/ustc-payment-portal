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

## Migration Plan

1. **Create Stg and Prod artifact buckets (Terraform)** — add a new `artifacts_bucket` module instance in `terraform/environments/stg` and `terraform/environments/prod`. Enable versioning and encryption. Enable Object Lock on the Stg and Prod buckets (not Dev). **Do we only want object lock on Prod?**

2. **Upload Lambda ZIPs to GH artifact during PR builds** — add `actions/upload-artifact` to the `pr_build_test_deploy` job in `cicd-dev.yml` after the build step. The PR still uploads to S3 for its ephemeral Terraform environment, but GH artifact becomes the authoritative copy for the promotion chain.

3. **Update the dev deploy job** — replace the `promote_artifacts_s3.sh` call (which currently copies PR→dev within the same bucket) with: download from GH artifact, upload to the dev bucket using `--checksum-algorithm sha256`. After upload, fetch `x-amz-checksum-sha256` via `HeadObject` and assert it matches the hash computed in step 2. Store the GH run ID in the dev git tag annotation for traceability.

4. **Update `staging-deploy.yml`** — instead of copying from the dev bucket, read the GH run ID from the dev git tag annotation and use `actions/download-artifact` to pull the ZIPs directly from GH. Upload to the stg bucket with `--checksum-algorithm sha256` and verify the hash. Object Lock retention is applied on landing. Change `TF_VAR_artifact_bucket` to the stg bucket. **We don't need to calculate the sha256 hash ourselves, the AWS CLI does it automatically 

5. **Update `prod-deploy.yml`** — copy from the stg bucket → prod bucket with checksum re-verification. Object Lock retention applied on landing. Point Terraform at the prod bucket.
  - `Stg` needs to permit access on it's policy, and Prod's deployer role will need to also allow `s3:GetObject` on the stg bucket.

6. **Update IAM** — GH Actions OIDC needs `s3:PutObject` on the dev bucket (already exists) and the stg bucket (new). Grant the prod deployer role cross-account `s3:GetObject` on the stg bucket scoped to `artifacts/stg/*`. No cross-account trust between Dev and Stg accounts is needed.

7. **Remove old cross-account permissions** — once prod is confirmed working from the stg bucket, remove the `AllowProdDeployerGetDevObjects` Sid from the dev bucket policy. No `AllowStagingDeployerGetDevObjects` Sid is ever added.
