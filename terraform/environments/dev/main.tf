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
  source                    = "../../modules/lambda"
  function_name_prefix      = local.name_prefix
  lambda_execution_role_arn = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids        = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables     = local.lambda_env

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

resource "aws_route53_zone" "this" {
  count = local.environment == "dev" ? 1 : 0
  name  = local.custom_domain

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }

  depends_on = [module.iam_cicd]
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

  depends_on = [module.iam_cicd]
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

  depends_on = [module.secrets, aws_acm_certificate_validation.this]
}

# Read allowed account IDs from Secrets Manager for API Gateway resource policy
# This secret is seeded with [] and should be populated via AWS CLI/Console
data "aws_secretsmanager_secret_version" "allowed_account_ids" {
  secret_id  = module.secrets.allowed_account_ids_secret_id
  depends_on = [module.secrets]
}

module "iam_cicd" {
  source = "../../modules/iam"

  aws_region               = local.aws_region
  environment              = local.environment
  deploy_role_name         = local.environment == "dev" ? "ustc-payment-processor-dev-cicd-deployer-role" : "${local.name_prefix}-cicd-deployer-role"
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = local.github_org
  github_repo              = local.github_repo
  state_bucket_name        = local.state_bucket_name
  state_object_keys        = local.state_object_keys
  lambda_exec_role_arn     = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  lambda_name_prefix       = local.name_prefix
  create_lambda_exec_role  = false
}

module "artifacts_bucket" {
  count  = local.environment == "dev" ? 1 : 0
  source = "../../modules/artifacts_bucket"

  build_artifacts_bucket_name = "ustc-payment-portal-build-artifacts"
  deployer_role_arn           = module.iam_cicd.role_arn
  manage_bucket_policy        = true
  staging_deployer_role_arn   = "arn:aws:iam::747103385969:role/ustc-payment-processor-stg-cicd-deployer-role"
  prod_deployer_role_arn      = "arn:aws:iam::802939326821:role/ustc-payment-processor-prod-cicd-deployer-role"
}

# Reference existing bucket in PR workspaces
data "aws_s3_bucket" "existing_artifacts" {
  count  = local.environment != "dev" ? 1 : 0
  bucket = "ustc-payment-portal-build-artifacts"
}

# Attach artifact bucket policy to deployer role (GitHub Actions --> AWS deployment)
resource "aws_iam_role_policy_attachment" "ci_build_artifacts" {
  role       = module.iam_cicd.role_name
  policy_arn = local.environment == "dev" ? module.artifacts_bucket[0].build_artifacts_access_policy_arn : local.artifacts_bucket_policy_arn
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

# Consolidated policy for the shared dev deployer role per PR workspace.
# Kept as one policy (3 statements) to stay well under AWS's 10 inline-policy limit
# when multiple PR workspaces are active concurrently.
resource "aws_iam_role_policy" "deployer_pr_workspace" {
  name = "pr-workspace-${local.name_prefix}"
  role = local.dev_deployer_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AssumeTestUnauthorizedRole"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = aws_iam_role.test_unauthorized.arn
      },
      {
        Sid      = "InvokeMigrationRunner"
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-migrationRunner"
      },
      {
        Sid      = "InvokeApiGateway"
        Effect   = "Allow"
        Action   = "execute-api:Invoke"
        Resource = "${module.api.api_gateway_execution_arn}/*"
      }
    ]
  })
}
