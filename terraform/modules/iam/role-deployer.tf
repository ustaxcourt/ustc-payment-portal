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
        Effect   = "Allow",
        Action   = ["s3:ListBucket"],
        Resource = "arn:aws:s3:::${local.tf_state_bucket_name}"
      },
      {
        Effect = "Allow",
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        Resource = [
          "arn:aws:s3:::${local.tf_state_bucket_name}/*"
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
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.lambda_name_prefix}*"
      },
      {
        Effect   = "Allow",
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.lambda_name_prefix}*-migrationRunner"
      },
      {
        Effect   = "Allow",
        Action   = ["iam:PassRole"],
        Resource = aws_iam_role.lambda_exec.arn,
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "lambda.amazonaws.com"
          }
        }
      },
      {
        Effect   = "Allow", # Pass the Chatbot service role created by the monitoring module
        Action   = ["iam:PassRole"],
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.lambda_name_prefix}-chatbot-role",
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "chatbot.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow",
        Action = [
          "chatbot:UpdateMicrosoftTeamsChannelConfiguration",
          "chatbot:DeleteMicrosoftTeamsChannelConfiguration",
          "chatbot:GetMicrosoftTeamsChannelConfiguration",
          "chatbot:TagResource",
          "chatbot:UntagResource",
          "chatbot:ListTagsForResource"
        ],
        Resource = "arn:aws:chatbot::${data.aws_caller_identity.current.account_id}:chat-configuration/microsoft-teams-channel/${var.lambda_name_prefix}-*"
      },
      {
        # Create + List don't support resource-level permissions per AWS.
        Effect = "Allow",
        Action = [
          "chatbot:CreateMicrosoftTeamsChannelConfiguration",
          "chatbot:ListMicrosoftTeamsChannelConfigurations"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow", # Log metric filters for Lambda 5xx and API Gateway 429 detection
        Action = [
          "logs:PutMetricFilter",
          "logs:DeleteMetricFilter",
          "logs:DescribeMetricFilters"
        ],
        Resource = [
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.lambda_name_prefix}-*:*",
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/*:*"
        ]
      },
      {
        Effect = "Allow",
        Action = ["iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies"],
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.deploy_role_name}",
          aws_iam_role.lambda_exec.arn
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:PATCH",
          "apigateway:DELETE",
          "apigateway:UpdateRestApiPolicy"
        ],
        Resource = [
          "arn:aws:apigateway:${local.aws_region}::/restapis*",
          "arn:aws:apigateway:${local.aws_region}::/deployments*",
          "arn:aws:apigateway:${local.aws_region}::/domainnames*",
          "arn:aws:apigateway:${local.aws_region}::/basepathmappings*"
        ]
      },
      {
        # Account-level resource for aws_api_gateway_account (sets CloudWatch logging role).
        # Cannot be scoped further — /account is the only ARN for this resource.
        Effect   = "Allow",
        Action   = ["apigateway:GET", "apigateway:PATCH"],
        Resource = "arn:aws:apigateway:${local.aws_region}::/account"
      },
      {
        Effect   = "Allow",
        Action   = ["iam:PassRole"],
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.lambda_name_prefix}-apigw-*",
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "apigateway.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow",
        Action = [
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "acm:DeleteCertificate",
          "acm:AddTagsToCertificate",
          "acm:ListTagsForCertificate"
        ],
        Resource = "arn:aws:acm:${local.aws_region}:${data.aws_caller_identity.current.account_id}:certificate/*"
      },
      {
        # RequestCertificate cannot be scoped to a specific ARN — the cert doesn't exist yet at call time
        Effect   = "Allow",
        Action   = ["acm:RequestCertificate"],
        Resource = "*"
      },
      {
        # CreateHostedZone cannot be scoped to a specific zone — the zone doesn't exist yet at call time
        Effect   = "Allow",
        Action   = ["route53:CreateHostedZone"],
        Resource = "*"
      },
      {
        # Zone-scoped actions: manage records and tags within hosted zones
        Effect = "Allow",
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListTagsForResource",
          "route53:ChangeTagsForResource"
        ],
        Resource = "arn:aws:route53:::hostedzone/*"
      },
      {
        # Required by AWS — cannot be scoped to a specific resource
        Effect   = "Allow",
        Action   = ["route53:ListHostedZones"],
        Resource = "*"
      },
      {
        # Scoped to change tracking ARNs — required to poll propagation status
        Effect   = "Allow",
        Action   = ["route53:GetChange"],
        Resource = "arn:aws:route53:::change/*"
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
        Effect = "Allow", #secrets manager
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteResourcePolicy",
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutResourcePolicy",
          "secretsmanager:PutSecretValue",
          "secretsmanager:TagResource",
          "secretsmanager:UntagResource",
          "secretsmanager:UpdateSecret",
          "secretsmanager:UpdateSecretVersionStage"
        ],
        Resource = [
          "arn:aws:secretsmanager:${local.aws_region}:${data.aws_caller_identity.current.account_id}:secret:ustc/pay-gov/*",
          "arn:aws:secretsmanager:${local.aws_region}:${data.aws_caller_identity.current.account_id}:secret:rds!*"
        ]
      },
      {
        Effect = "Allow", #iam role creation (for self-management)
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:UpdateAssumeRolePolicy",
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
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.lambda_name_prefix}-*",
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
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.lambda_name_prefix}-*"
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
          "rds:ListTagsForResource",
          "rds:DescribeDBProxies",
          "rds:DescribeDBProxyTargets",
          "rds:DescribeDBProxyTargetGroups"
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
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:db:${var.lambda_name_prefix}-*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:db:*-pr-*-db",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:subgrp:*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:snapshot:*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:pg:${var.lambda_name_prefix}-*"
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
      },
      {
        Effect = "Allow", # RDS Proxy management for Lambda connection pooling
        Action = [
          "rds:CreateDBProxy",
          "rds:DeleteDBProxy",
          "rds:ModifyDBProxy",
          "rds:RegisterDBProxyTargets",
          "rds:DeregisterDBProxyTargets",
          "rds:ModifyDBProxyTargetGroup",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource"
        ],
        Resource = [
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:db-proxy:*",
          "arn:aws:rds:${local.aws_region}:${data.aws_caller_identity.current.account_id}:target-group:*"
        ]
      },
      {
        Effect   = "Allow", # Pass the RDS Proxy's role to the proxy service at create time
        Action   = ["iam:PassRole"],
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.lambda_name_prefix}-proxy-role",
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "rds.amazonaws.com"
          }
        }
      },
      {
        Effect   = "Allow",
        Action   = ["execute-api:Invoke"],
        Resource = "arn:aws:execute-api:${local.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow", # SNS topics — scoped to project-prefixed alert topics
        Action = [
          "sns:CreateTopic",
          "sns:DeleteTopic",
          "sns:GetTopicAttributes",
          "sns:SetTopicAttributes",
          "sns:ListTagsForResource",
          "sns:TagResource",
          "sns:UntagResource",
          "sns:Subscribe",
          "sns:ConfirmSubscription",
          "sns:ListSubscriptionsByTopic"
        ],
        Resource = "arn:aws:sns:${local.aws_region}:${data.aws_caller_identity.current.account_id}:${var.lambda_name_prefix}-*"
      },
      {
        Effect = "Allow",
        Action = [
          "sns:Unsubscribe",
          "sns:GetSubscriptionAttributes",
          "sns:SetSubscriptionAttributes"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow", # CloudWatch alarms — scoped to project-prefixed alarms
        Action = [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:ListTagsForResource",
          "cloudwatch:TagResource",
          "cloudwatch:UntagResource"
        ],
        Resource = "arn:aws:cloudwatch:${local.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${var.lambda_name_prefix}-*"
      },
      {
        Effect   = "Allow",
        Action   = ["cloudwatch:DescribeAlarms"],
        Resource = "*"
      },
      {
        # DescribeParameters cannot be scoped to a specific resource — AWS requires "*"
        Effect   = "Allow",
        Action   = ["ssm:DescribeParameters"],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:AddTagsToResource",
          "ssm:ListTagsForResource"
        ],
        Resource = "arn:aws:ssm:${local.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/ustc/pay-gov/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_pr_log_cleanup" {
  count = local.environment == "dev" ? 1 : 0
  name  = "${local.project_name}-${local.environment}-ci-pr-log-cleanup"
  role  = aws_iam_role.github_actions_deployer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:PutSubscriptionFilter",
          "logs:DeleteSubscriptionFilter",
          "logs:DeleteLogGroup"
        ]
        Resource = [
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.lambda_name_prefix}-pr-*",
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.lambda_name_prefix}-pr-*:*",
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/pr-*",
          "arn:aws:logs:${local.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/apigateway/pr-*:*"
        ]
      }
    ]
  })
}
