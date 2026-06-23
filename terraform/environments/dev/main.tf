data "aws_caller_identity" "current" {}

data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket  = "ustc-payment-portal-terraform-state-dev"
    key     = "ustc-payment-portal/dev/networking.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

resource "random_password" "rds_master" {
  count            = local.environment == "dev" ? 1 : 0
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+[]{}<>:?"
  keepers = {
    db_identifier = "${local.name_prefix}-db"
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  count     = local.environment == "dev" ? 1 : 0
  secret_id = module.secrets.rds_credentials_secret_id
  secret_string = jsonencode({
    username = "payment_portal_admin"
    password = random_password.rds_master[0].result
  })
}

module "lambda" {
  source                            = "../../modules/lambda"
  function_name_prefix              = local.name_prefix
  lambda_execution_role_arn         = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                        = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids                = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables_by_function = local.lambda_env_by_function

  artifact_bucket = var.artifact_bucket
  artifact_s3_keys = {
    initPayment                 = var.initPayment_s3_key
    processPayment              = var.processPayment_s3_key
    getDetails                  = var.getDetails_s3_key
    testCert                    = var.testCert_s3_key
    migrationRunner             = var.migrationRunner_s3_key
    getAllTransactions          = var.getAllTransactions_s3_key
    getTransactionsByStatus     = var.getTransactionsByStatus_s3_key
    getTransactionPaymentStatus = var.getTransactionPaymentStatus_s3_key
  }
  source_code_hashes = {
    initPayment                 = var.initPayment_source_code_hash
    processPayment              = var.processPayment_source_code_hash
    getDetails                  = var.getDetails_source_code_hash
    testCert                    = var.testCert_source_code_hash
    migrationRunner             = var.migrationRunner_source_code_hash
    getAllTransactions          = var.getAllTransactions_source_code_hash
    getTransactionsByStatus     = var.getTransactionsByStatus_source_code_hash
    getTransactionPaymentStatus = var.getTransactionPaymentStatus_source_code_hash
  }

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

module "rds" {
  count  = local.environment == "dev" ? 1 : 0
  source = "../../modules/rds"

  identifier = "${local.name_prefix}-db"
  db_name    = "paymentportal"
  username   = "payment_portal_admin"
  password   = random_password.rds_master[0].result

  manage_master_user_password = false

  db_subnet_group_name = data.terraform_remote_state.foundation.outputs.db_subnet_group_name

  vpc_security_group_ids = [
    data.terraform_remote_state.foundation.outputs.rds_security_group_id
  ]

  multi_az = false

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

# Proxy lives only in the dev workspace; PR workspaces bypass it and connect
# directly to the shared dev RDS. Lower cap (50%) leaves slots for those direct PRs.
module "rds_proxy" {
  count  = local.environment == "dev" ? 1 : 0
  source = "../../modules/rds-proxy"

  name                    = "${local.name_prefix}-proxy"
  secret_arn              = module.secrets.rds_credentials_secret_arn
  rds_instance_identifier = module.rds[0].instance_identifier
  vpc_subnet_ids          = data.terraform_remote_state.foundation.outputs.proxy_subnet_ids
  vpc_security_group_ids  = [data.terraform_remote_state.foundation.outputs.proxy_security_group_id]
  max_connections_percent = 50

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_route53_zone" "this" {
  count = local.environment == "dev" ? 1 : 0
  name  = local.custom_domain

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_acm_certificate" "this" {
  count             = local.environment == "dev" ? 1 : 0
  domain_name       = local.custom_domain
  validation_method = "DNS"

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.environment == "dev" ? {
    for dvo in aws_acm_certificate.this[0].domain_validation_options : dvo.domain_name => dvo
  } : {}

  zone_id = aws_route53_zone.this[0].zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "this" {
  count                   = local.environment == "dev" ? 1 : 0
  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

module "api" {
  source = "../../modules/api-gateway"

  lambda_function_arns     = module.lambda.function_arns
  environment              = local.environment == "dev" ? "dev" : local.environment
  stage_name               = local.environment == "dev" ? "dev" : local.environment
  allowed_account_ids      = local.allowed_client_account_ids
  dashboard_allowed_origin = local.dashboard_allowed_origin
  custom_domain            = local.environment == "dev" ? local.custom_domain : ""
  certificate_arn          = local.environment == "dev" ? aws_acm_certificate_validation.this[0].certificate_arn : ""
  route53_zone_id          = local.environment == "dev" ? aws_route53_zone.this[0].zone_id : ""
  enable_public_dashboard  = startswith(local.environment, "pr-") || local.environment == "dev"
  enable_access_logging          = false
  enable_per_endpoint_throttling = false

  depends_on = [module.secrets, aws_acm_certificate_validation.this]
}

# Scheduled Pay.gov health probe + alarm. Real dev env only — PR workspaces are
# ephemeral and must not run a 15-min probe or create alarms on the shared metric.
# No SNS target in dev (the monitoring module / alerts topic is stg+prod only).
module "paygov_health" {
  count  = local.environment == "dev" ? 1 : 0
  source = "../../modules/paygov-health"

  name_prefix            = local.name_prefix
  environment            = local.app_env
  testcert_function_name = module.lambda.function_names["testCert"]
  testcert_function_arn  = module.lambda.function_arns["testCert"]

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

# Read allowed account IDs from Secrets Manager for API Gateway resource policy
# This secret is seeded with [] and should be populated via AWS CLI/Console
data "aws_secretsmanager_secret_version" "allowed_account_ids" {
  secret_id  = module.secrets.allowed_account_ids_secret_id
  depends_on = [module.secrets]
}

resource "aws_ssm_parameter" "dev_rds_endpoint" {
  count = local.environment == "dev" ? 1 : 0
  name  = "/ustc/pay-gov/dev/rds-endpoint"
  type  = "String"
  value = module.rds[0].endpoint

  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

resource "aws_ssm_parameter" "dev_rds_secret_arn" {
  count = local.environment == "dev" ? 1 : 0
  name  = "/ustc/pay-gov/dev/rds-secret-arn"
  type  = "String"
  value = module.secrets.rds_credentials_secret_arn

  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

data "aws_ssm_parameter" "dev_rds_endpoint" {
  count = local.environment != "dev" ? 1 : 0
  name  = "/ustc/pay-gov/dev/rds-endpoint"
}

data "aws_ssm_parameter" "dev_rds_secret_arn" {
  count = local.environment != "dev" ? 1 : 0
  name  = "/ustc/pay-gov/dev/rds-secret-arn"
}

# Reference existing bucket in PR workspaces
data "aws_s3_bucket" "existing_artifacts" {
  count  = local.environment != "dev" ? 1 : 0
  bucket = "ustc-payment-portal-build-artifacts"
}



# =============================================================================
# Unauthorized Test Role (for Lambda-level authorization testing)
# =============================================================================
# This role is intentionally NOT added to the client-permissions secret.
# It allows testing that Lambda correctly rejects requests from unregistered clients.
# The role CAN call the API Gateway (same account = allowed by resource policy),
# but will be rejected by Lambda with "Client not registered".

# The shared dev deployer role used by GitHub Actions for all PR environments
locals {
  dev_deployer_role_name = "ustc-payment-processor-dev-cicd-deployer-role"
  dev_deployer_role_arn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.dev_deployer_role_name}"
}

resource "aws_iam_role" "test_unauthorized" {
  name = "${local.name_prefix}-test-unauthorized-role"

  # Trust policy: allow the SHARED dev deployer role (used by GitHub Actions)
  # to assume this role, not the PR workspace's own role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = local.dev_deployer_role_arn
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Purpose = "Integration testing - Lambda authorization rejection"
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_iam_role_policy" "test_unauthorized_api_invoke" {
  name = "api-gateway-invoke"
  role = aws_iam_role.test_unauthorized.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "execute-api:Invoke"
        Resource = "${module.api.api_gateway_execution_arn}/*"
      }
    ]
  })
}

# Runtime-invoke permissions for the dev deployer role (assume test roles,
# invoke migration runners, call API Gateway stages). The dev deployer is
# shared between PR work and post-merge dev deploys, so both dev and pr-*
# ARNs are listed.
#
# One shared policy instead of per-PR: AWS caps the sum of inline policy size
# on a role at 10,240 bytes — per-PR policies hit the cap at ~17 concurrent
# PRs. Created once in the default (dev) workspace; PR workspaces don't touch
# the role.
#
# Stage names are deterministic ("dev" or "pr-<num>") — see stage_name above.
resource "aws_iam_role_policy" "deployer_pr_workspaces" {
  count = local.environment == "dev" ? 1 : 0
  name  = "pr-workspaces"
  role  = local.dev_deployer_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AssumeTestUnauthorizedRoles"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-processor-test-unauthorized-role",
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-processor-pr-*-test-unauthorized-role",
        ]
      },
      {
        Sid    = "InvokeMigrationRunners"
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:ustc-payment-processor-migrationRunner",
          "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:ustc-payment-processor-pr-*-migrationRunner",
        ]
      },
      {
        Sid    = "InvokeApiGateways"
        Effect = "Allow"
        Action = "execute-api:Invoke"
        Resource = [
          "arn:aws:execute-api:${local.aws_region}:${data.aws_caller_identity.current.account_id}:*/dev/*/*",
          "arn:aws:execute-api:${local.aws_region}:${data.aws_caller_identity.current.account_id}:*/pr-*/*/*",
        ]
      }
    ]
  })
}
