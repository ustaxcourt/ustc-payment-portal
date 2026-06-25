# General-purpose read-only CI role. Currently assumed by the terraform-plan workflow on PRs;
# safe for any future CI use case that only needs to inspect AWS state.

resource "aws_iam_role" "github_actions_read_only" {
  name = local.read_only_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GithubOIDCAssumeRole"
        Effect = "Allow"
        Action = "sts:AssumeRoleWithWebIdentity"
        Principal = {
          Federated = local.github_oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = local.github_sub
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_read_only" {
  name = "${local.project_name}-${local.environment}-read-only"
  role = aws_iam_role.github_actions_read_only.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        # State bucket — read state file, list contents. NO Put/Delete (plan workflow uses -lock=false).
        Effect = "Allow",
        Action = ["s3:GetObject", "s3:ListBucket"],
        Resource = [
          "arn:aws:s3:::${local.tf_state_bucket_name}",
          "arn:aws:s3:::${local.tf_state_bucket_name}/*"
        ]
      },
      {
        # All other buckets — bucket-attribute reads only, no GetObject.
        Effect = "Allow",
        Action = [
          "s3:GetBucket*",
          "s3:ListBucket",
          "s3:ListAllMyBuckets",
          "s3:GetEncryptionConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetReplicationConfiguration",
          "s3:GetAccelerateConfiguration",
          "s3:GetAnalyticsConfiguration",
          "s3:GetIntelligentTieringConfiguration",
          "s3:GetInventoryConfiguration",
          "s3:GetMetricsConfiguration",
          "s3:GetOwnershipControls"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "lambda:Get*",
          "lambda:List*"
        ],
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.lambda_name_prefix}*"
      },
      {
        Effect = "Allow",
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions"
        ],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.deploy_role_name}",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.read_only_role_name}",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.lambda_name_prefix}-*",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/*lambda*",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/build-artifacts-access-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.lambda_name_prefix}-*",
          aws_iam_role.lambda_exec.arn
        ]
      },
      {
        # apigateway:GET covers all read operations in API Gateway management API.
        Effect = "Allow",
        Action = ["apigateway:GET"],
        Resource = [
          "arn:aws:apigateway:${local.aws_region}::/restapis*",
          "arn:aws:apigateway:${local.aws_region}::/deployments*",
          "arn:aws:apigateway:${local.aws_region}::/domainnames*",
          "arn:aws:apigateway:${local.aws_region}::/basepathmappings*"
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "route53:ListHostedZones",
          "route53:GetHostedZone",
          "route53:ListResourceRecordSets",
          "route53:ListTagsForResource",
          "route53:GetChange"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:DescribeSubscriptionFilters",
          "logs:DescribeMetricFilters",
          "logs:ListTagsForResource"
        ],
        Resource = "*"
      },
      {
        # All EC2 Describe* actions are read-only by definition.
        Effect   = "Allow",
        Action   = ["ec2:Describe*"],
        Resource = "*"
      },
      {
        # Secret metadata only — no value reads.
        Effect = "Allow",
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:ListSecretVersionIds"
        ],
        Resource = "*"
      },
      {
        # GetSecretValue is required because terraform plan refreshes aws_secretsmanager_secret_version
        # resources and evaluates aws_secretsmanager_secret_version data sources. Scoped to the same
        # ARN prefixes the deployer role already accesses — see docs/PAY-264-readonly-role.md "Known limitation".
        Effect = "Allow",
        Action = ["secretsmanager:GetSecretValue"],
        Resource = [
          "arn:aws:secretsmanager:${local.aws_region}:${data.aws_caller_identity.current.account_id}:secret:ustc/pay-gov/*",
          "arn:aws:secretsmanager:${local.aws_region}:${data.aws_caller_identity.current.account_id}:secret:rds!*"
        ]
      },
      {
        # DescribeParameters cannot be scoped to a specific resource — AWS requires "*".
        Effect   = "Allow",
        Action   = ["ssm:DescribeParameters"],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:ListTagsForResource"
        ],
        Resource = "arn:aws:ssm:${local.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/ustc/pay-gov/*"
      },
      {
        Effect = "Allow",
        Action = [
          "rds:Describe*",
          "rds:ListTagsForResource"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "sns:GetTopicAttributes",
          "sns:ListTagsForResource",
          "sns:ListSubscriptionsByTopic",
          "sns:GetSubscriptionAttributes"
        ],
        Resource = "arn:aws:sns:${local.aws_region}:${data.aws_caller_identity.current.account_id}:${var.lambda_name_prefix}-*"
      },
      {
        Effect = "Allow",
        Action = [
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListTagsForResource"
        ],
        Resource = "*"
      },
      {
        # Plan/refresh of the paygov-health EventBridge rule (read-only counterpart
        # to the deployer's events:PutRule). Required so `terraform plan` can read the
        # deployer-managed rule; unrelated to RDS Proxy but needed to keep plan green.
        Effect = "Allow",
        Action = [
          "events:DescribeRule",
          "events:ListTargetsByRule",
          "events:ListTagsForResource"
        ],
        Resource = "arn:aws:events:${local.aws_region}:${data.aws_caller_identity.current.account_id}:rule/${var.lambda_name_prefix}-*"
      },
      {
        Effect = "Allow",
        Action = [
          "chatbot:GetMicrosoftTeamsChannelConfiguration",
          "chatbot:ListMicrosoftTeamsChannelConfigurations",
          "chatbot:ListTagsForResource"
        ],
        Resource = "*"
      }
    ]
  })
}
