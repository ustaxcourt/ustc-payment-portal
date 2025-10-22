output "bucket_name" {
  value = aws_s3_bucket.build_artifacts.id
  description = "Build artifacts bucket ID"
}

output "bucket_arn" {
  value = aws_s3_bucket.build_artifacts.arn
  description = "ARN for build artifacts bucket"
}
