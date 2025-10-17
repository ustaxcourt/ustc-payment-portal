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

# AWS OIDC <--> Github actions IAM Role

resource "aws_iam_role" "github_actions_deployer" {
  name = local.deploy_role_name

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
   name = "${local.project_name}-${local.environment}-ci-deployer"
  role = aws_iam_role.github_actions_deployer.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = ["s3:ListBucket"],
        Resource = "arn:aws:s3:::${local.tf_state_bucket_name}"
      },
      {
        Effect = "Allow",
        Action = ["s3:GetObject","s3:PutObject"],
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
      { #lock table
        Effect   = "Allow",
        Action   = ["dynamodb:DescribeTable","dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem"],
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
          "lambda:TagResource",
          "lambda:UntagResource"
        ],
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.lambda_name_prefix}*"
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
        Action = ["iam:GetRole","iam:ListRolePolicies","iam:GetRolePolicy","iam:ListAttachedRolePolicies"],
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
        Action   = ["acm:ListCertificates","acm:DescribeCertificate"],
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
          "logs:TagResource"
        ],
        Resource = "*"
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
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:TagRole",
          "iam:UntagRole"
        ],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-processor-*",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/*lambda*"
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
      }
    ]
  })
}



