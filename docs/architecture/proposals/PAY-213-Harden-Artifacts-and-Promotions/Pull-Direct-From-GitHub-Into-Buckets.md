# Separate Artifact Buckets Per Env, but all pulling from GH Artifacts.

**Rejected by Team**

Similar to the `Artifact Bucket Per Environment` solution — both approaches pull from GH Actions artifacts. The difference is routing: in the bucket chain, GH feeds Dev and Stg independently, and Stg feeds Prod. Here, GH feeds all three environments directly, with no Stg → Prod copy step.

## Security

The main benefit of this approach is that it doesn't require the 3 environments to have cross-account relationships with each other. We can still check the SHA256 hash after an artifact arrives in each bucket, and we can still lock objects, however we don't get the **chain-of-custody** benefit that the bucket chain strategy gets us. GitHub would need `s3:PutObject` for all 3 environments to upload artifacts. In the Bucket Chain approach, we only need it for `Dev`.

**The primary weakness here is that all trust is centralized in GitHub. If a bad actor gets into our GitHub Org, they gain access to all 3 environments.**

## Reliability

Each environment is fully independent from GitHub the moment that the artifact arrives in the bucket. Each one has a rollback history ready to go in the account, should the need arise. Promoting artifacts also requires that GitHub be available at deploy time.

## Cost

Going by the zip sizes in the Dev bucket, per function each zip is about **100 KB**. Pretending for a moment that we are a much larger API, let's say 10 Lambda functions at **100 KB** each, that's about **1 MB** per build. At **$0.023 per GB** for S3 with 10 artifacts stored, we would be looking at **$0.00023** per month. Call it **$0.00069** total per month for all 3 buckets, storing 10 artifacts each at any given moment.

`10 Artifacts x 1 MB per Artifact = 10 MB Total x 3 buckets @ $0.00023 Per Month = $0.00069 per month`

## Operational Integrity

We can use S3's built in hash check to verify builds once they get uploaded to the bucket. We can also lock Objects once they arrive to better protect them against accidental deletion or tampering. That being said however, having each bucket grab directly from GitHub prevents us from having a natural promotion gate. It's possible for someone to promote an artifact directly to `Prod`, without it going through `Stg` first. We also wouldn't be able to prove that the artifact existed on `Stg` before `Prod`, and whether or not it was tested against Pay.gov's QA Environment.
