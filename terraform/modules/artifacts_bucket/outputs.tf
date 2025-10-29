output "bucket_name" {
  value       = aws_s3_bucket.build_artifacts.id
  description = "Build artifacts bucket ID"
}

output "bucket_arn" {
  value       = aws_s3_bucket.build_artifacts.arn
  description = "ARN for build artifacts bucket"
}

output "build_artifacts_access_policy_arn" {
  description = "ARN of the build artifacts IAM policy"
  value       = aws_iam_policy.build_artifacts_access_policy.arn
}
