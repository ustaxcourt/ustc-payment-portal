data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = var.assume_role_services
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_exec" {
  count              = var.create_lambda_exec_role ? 1 : 0
  name               = "${var.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  count      = var.create_lambda_exec_role && var.attach_basic_execution ? 1 : 0
  role       = aws_iam_role.lambda_exec[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "vpc_access" {
  count      = var.create_lambda_exec_role && var.attach_vpc_access ? 1 : 0
  role       = aws_iam_role.lambda_exec[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "github_actions_deployer" {
  count = var.create_deployer_role ? 1 : 0
  name  = local.deploy_role_name

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

resource "aws_iam_role_policy" "github_actions_permissions" {
  count = var.create_deployer_role ? 1 : 0
  name  = "${local.project_name}-${local.environment}-ci-deployer"
  role  = aws_iam_role.github_actions_deployer[0].id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["s3:ListBucket"],
        Resource = "arn:aws:s3:::${local.tf_state_bucket_name}"
      },
      {
        Effect = "Allow",
        Action = ["s3:GetObject", "s3:PutObject"],
        Resource = [
          "arn:aws:s3:::${local.tf_state_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow",
        Action = ["s3:DeleteObject"],
        Resource = [
          "arn:aws:s3:::${local.tf_state_bucket_name}/env:/pr-*/*"
        ]
      },
      # Read access to build artifacts used for Lambda code updates
      {
        Effect   = "Allow",
        Action   = ["s3:GetObject", "s3:HeadObject"],
        Resource = "arn:aws:s3:::ustc-payment-portal-build-artifacts/artifacts/dev/*"
      },
      {
        Effect   = "Allow",
        Action   = ["s3:ListBucket"],
        Resource = "arn:aws:s3:::ustc-payment-portal-build-artifacts"
      },
      { #lock table
        Effect   = "Allow",
        Action   = ["dynamodb:DescribeTable", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"],
        Resource = "arn:aws:dynamodb:${local.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.tf_lock_table_name}"
      },
      {
        Effect = "Allow",
        Action = [
          "lambda:CreateFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:DeleteFunction",
          "lambda:GetFunction*",
          "lambda:GetPolicy",
          "lambda:ListVersionsByFunction",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:TagResource",
          "lambda:UntagResource"
        ],
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:ustc-payment-processor*"
      },
      {
        Effect   = "Allow",
        Action   = ["iam:PassRole"],
        Resource = local.lambda_exec_role_arn,
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "lambda.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow",
        Action = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.deploy_role_name}",
          local.lambda_exec_role_arn
        ]
      },
      {
        Effect = "Allow",
        Action = ["apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:PATCH",
        "apigateway:DELETE"],
        Resource = [
          "arn:aws:apigateway:${local.aws_region}::/restapis*",
          "arn:aws:apigateway:${local.aws_region}::/deployments*",
          "arn:aws:apigateway:${local.aws_region}::/domainnames*",
          "arn:aws:apigateway:${local.aws_region}::/basepathmappings*"
        ]
      },
      {
        Effect   = "Allow",
        Action   = ["acm:ListCertificates", "acm:DescribeCertificate"],
        Resource = "*"
      },
      {
        Effect = "Allow", #cloudwatch logs
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:ListTagsForResource",
          "logs:TagResource",
          "logs:PutRetentionPolicy"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow", # delete/manage PR Lambda log groups
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:PutSubscriptionFilter",
          "logs:DeleteSubscriptionFilter",
          "logs:DeleteLogGroup"
        ],
        Resource = [
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/ustc-payment-processor-pr-*",
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/ustc-payment-processor-pr-*:*"
        ]
      },
      {
        Effect = "Allow", #secrets manager
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecret",
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:PutResourcePolicy",
          "secretsmanager:DeleteResourcePolicy",
          "secretsmanager:TagResource",
          "secretsmanager:UntagResource"
        ],
        Resource = "arn:aws:secretsmanager:${local.aws_region}:${data.aws_caller_identity.current.account_id}:secret:ustc/pay-gov/*"
      },
      {
        Effect = "Allow", #iam role creation (for self-management)
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:GetRole",
          "iam:ListRolePolicies",
          "iam:GetRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListInstanceProfilesForRole",
          "iam:TagRole",
          "iam:UntagRole"
        ],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-processor-*",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/*lambda*"
        ]
      },
      {
        Effect = "Allow", #iam policy management
        Action = [
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:TagPolicy",
          "iam:UntagPolicy"
        ],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/build-artifacts-access-policy",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/ustc-payment-processor-*"
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "ec2:AllocateAddress",
          "ec2:CreateNatGateway",
          "ec2:DeleteNatGateway",
          "ec2:CreateRoute",
          "ec2:ReplaceRoute",
          "ec2:DeleteRoute",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:Describe*"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow", # RDS read permissions (require * for describe operations)
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBSubnetGroups",
          "rds:DescribeDBSnapshots",
          "rds:DescribeDBParameterGroups",
          "rds:DescribeDBParameters",
          "rds:ListTagsForResource"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow", # RDS write permissions for database provisioning
        Action = [
          "rds:CreateDBInstance",
          "rds:DeleteDBInstance",
          "rds:ModifyDBInstance",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource",
          "rds:CreateDBSnapshot",
          "rds:DeleteDBSnapshot",
          "rds:CreateDBParameterGroup",
          "rds:DeleteDBParameterGroup",
          "rds:ModifyDBParameterGroup"
        ],
        Resource = [
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:db:ustc-payment-processor-*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:db:*-pr-*-db",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:subgrp:*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:pg:ustc-payment-processor-*"
        ]
      },
      {
        Effect   = "Allow", # RDS service-linked role (required for first RDS instance)
        Action   = ["iam:CreateServiceLinkedRole"],
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS",
        Condition = {
          StringEquals = {
            "iam:AWSServiceName" = "rds.amazonaws.com"
          }
        }
      }
    ]
  })
}



