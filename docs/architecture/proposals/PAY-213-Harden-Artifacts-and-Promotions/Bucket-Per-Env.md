# Artifact Bucket Per Environment Approach (The Bucket Chain)

In this approach, we would add two additional buckets. One for Stg, and One for Prod. Artifacts first built in GitHub, and when Dev is deployed the artifact is uploaded to the Dev bucket. For Stg deploys, we promote one of the existing artifacts currently in Dev's bucket. Finally for Prod deploys, we promote one of the existing artifacts currently in Stg's bucket. (The artifact gets copied to the next bucket in line when promoted, and it's hash double checked.) **Each environment can only deploy artifacts from it's bucket.**

## Security

Security wise with this approach's primary benefit is blast radius control. If a bad actor were to get access to our AWS Dev Account, that only exposes the Dev Artifact bucket and the hosted Dev version of Payment Portal. It doesn't give them access to Stg or Prod's deployed artifact. The only **write** permission needed (`s3:PutObject`) is to allow our pipline in GH to copy published artifacts directly into the Dev enviornment bucket. From there, Stg would only need `s3:GetObject` cross-account permission to grab objects from Dev, and we can scope it so that it only has permission to access the Dev artifact bucket. It would also be the same for Prod, `s3:GetObject` permission to grab artifacts from Stg. We don't techinically need permission to see the artifacts, since we can determine there name via the pattern they follow: `artifacts/dev/<SHA>/<funcname>.zip`.

## Reliability/Single Point of Failure

Individual buckets for each environment act as a natural cache, giving us a window of the most recent validated builds that we can rollback to in the event of emergency. Once an artifact gets stored in the bucket, we are no longer dependent on the previous environment nor GitHub.

## Cost

Going by the zip sizes in the Dev bucket, per function each zip is about **100 KB**. Pretending for a moment that we are a much larger API, lets say 10 lambda functions at **100 KB** each, that's about **5 MB** per build. At **$0.023 per GB** for s3 with a 10 artifacts stored, we would be looking at **$0.00115** per month. Call it **$0.00345** total per month for all 3 buckets, storing 10 artifacts each at any given moment.

`10 Artifacts x 5 MB per = 50 MB Total x 3 buckets @ $0.00115 Per Month = $0.00345`

## Operational Integrity

Using S3's built in hash check, we can calculate an Artifact's SHA256 before uploading to Dev, and then re-check the hash after upload to Stg and Prod. If the SHA256 matches once we reach `Prod`, we know beyond a shadow of a doubt that the artifact hasn't been tampered with, and matches what we originally built in Github at the start of the process (Specifically `x-amz-checksum-sha256`). We can also lock the artifact so it can't be deleted until we are done with it. If the hash doesn't match, the artifact gets rejected and we stay on the current hosted artifact.
