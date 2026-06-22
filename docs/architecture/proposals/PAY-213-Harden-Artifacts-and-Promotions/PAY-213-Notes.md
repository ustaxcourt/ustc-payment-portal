# PAY-213
- Option 1: Per-environment buckets with a copy/promote workflow from bucket tu bucket.
- Option 2: Single bucket, S3 Object lock + Verifying hash on uploaded artifacts.
- Option 3: S3 Replication, artifacts get copied to stg and prod folders in the sam ebucket.
- Option 4: AWS Lambda Code Signing (Integrity enforced by Lambda itself). Lambda looks for a signature in the build it recieves, and rejects it if its not there.
- Option 5: Stage the isolation (Add a separate Prod bucket now, fix Stg later)
- Option 6: Use GH Release as the artifact store.
- Option 7: S3 Native Checksums
- Option 8: Separate account for the artifact bucket?

## What actually let us eliminate a single point of failure
1. Add artifact buckets to `stg` and `prod`, and include a copy step that jumps promoted artifacts from `dev -> stg -> prod`.
  - For additional security we can use checksums to verify artifacts between each environment before it's allowed in.
  - There's also Lambda Code Signing, but that might be overkill - think of it like Sigv4 signing (It tells the Lambda that a lambda update actually came from us.)
2. Separate AWS Account for Tools (essentiallly just an account with the artifact bucket)
  - Plus Checksums and Lambda Code Signing (if needed)
