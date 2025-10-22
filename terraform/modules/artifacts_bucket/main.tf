resource "aws_s3_bucket" "build_artifacts" {
  bucket = var.build_artifacts_bucket_name

  tags = {
    Name      = var.build_artifacts_bucket_name
    Project   = "ustc-payment-portal"
    ManagedBy = "terraform"
    Purpose   = "build-artifacts"
  }

}

resource "aws_s3_bucket_versioning" "build_artifacts" {
  bucket = aws_s3_bucket.build_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "build_artifacts" {
  bucket = aws_s3_bucket.build_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "build_artifacts" {
  bucket = aws_s3_bucket.build_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "build_artifacts" {
  bucket = aws_s3_bucket.build_artifacts.id

  rule {
    id = "delete-old-artifacts"

    expiration {
      days = 90
    }

    status = "Enabled"
  }
}



resource "aws_iam_policy" "build_artifacts_access_policy" {
  name        = "build-artifacts-access-policy"
  description = "Policy for build artifacts storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "Deny non-deployer access"
        Effect = "Deny"
        Action = "s3:*"
        Principal = "*"
        Resource = aws_s3_bucket.build_artifacts.arn

        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }

        }
      },
      {
        Sid = "Allow deployer role write"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketVersioning",
          "s3:GetObject",
          "s3:GetObjectVersioning",
          "s3:PutObject",
        ]
        Principal = { var.deployer_role_arn }
        Resource = aws_s3_bucket.build_artifacts.arn
      }
    ]
  })

  tags = {
    Project   = "ustc-payment-portal"
    ManagedBy = "terraform"
  }
}
