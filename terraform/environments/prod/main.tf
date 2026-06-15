data "aws_caller_identity" "current" {}

data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket  = "ustc-payment-portal-terraform-state-prod"
    key     = "ustc-payment-portal/prod/networking.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

module "lambda" {
  source                            = "../../modules/lambda"
  function_name_prefix              = local.name_prefix
  lambda_execution_role_arn         = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                        = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids                = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables_by_function = local.lambda_env_by_function

  # Consume dev artifacts by SHA (keys and optional hashes passed from workflow)
  artifact_bucket = var.artifact_bucket
  artifact_s3_keys = {
    initPayment    = var.initPayment_s3_key
    processPayment = var.processPayment_s3_key
    getDetails     = var.getDetails_s3_key
    testCert       = var.testCert_s3_key
  }
  source_code_hashes = {
    initPayment    = var.initPayment_source_code_hash
    processPayment = var.processPayment_source_code_hash
    getDetails     = var.getDetails_source_code_hash
    testCert       = var.testCert_source_code_hash
  }

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

module "rds" {
  source = "../../modules/rds"

  identifier = "${local.name_prefix}-db"
  db_name    = local.rds_db_name
  username   = "payment_portal_admin"

  manage_master_user_password = true

  db_subnet_group_name = data.terraform_remote_state.foundation.outputs.db_subnet_group_name

  vpc_security_group_ids = [
    data.terraform_remote_state.foundation.outputs.rds_security_group_id
  ]

  log_statement             = "ddl"
  max_allocated_storage     = 100
  multi_az                  = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "ustc-payment-processor-prod-final-snapshot"

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_route53_zone" "this" {
  name = local.custom_domain

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_acm_certificate" "this" {
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
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options : dvo.domain_name => dvo
  }

  zone_id = aws_route53_zone.this.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

resource "aws_iam_role" "api_gateway_cloudwatch_logs" {
  name = "${local.name_prefix}-apigw-cloudwatch-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch_logs" {
  role       = aws_iam_role.api_gateway_cloudwatch_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# One per AWS account per region — sets the default CloudWatch role for all API Gateway stages.
resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch_logs.arn
}

module "api" {
  source = "../../modules/api-gateway"

  lambda_function_arns = module.lambda.function_arns
  environment          = "prod"
  stage_name           = "prod"
  allowed_account_ids  = local.allowed_client_account_ids
  custom_domain        = local.custom_domain
  certificate_arn      = aws_acm_certificate_validation.this.certificate_arn
  route53_zone_id      = aws_route53_zone.this.zone_id

  depends_on = [module.secrets, aws_acm_certificate_validation.this, aws_api_gateway_account.this]
}

# Read allowed account IDs from Secrets Manager for API Gateway resource policy
# This secret is seeded with [] and should be populated via AWS CLI/Console
data "aws_secretsmanager_secret_version" "allowed_account_ids" {
  secret_id  = module.secrets.allowed_account_ids_secret_id
  depends_on = [module.secrets]
}

data "aws_ssm_parameter" "monitoring_subscribers" {
  name       = module.secrets.monitoring_subscribers_parameter_name
  depends_on = [module.secrets]
}

module "monitoring" {
  source = "../../modules/monitoring"

  env              = local.environment
  name_prefix      = local.name_prefix
  subscribers      = local.monitoring_subscribers
  runbook_url      = local.runbook_url
  teams_tenant_id  = var.teams_tenant_id
  teams_team_id    = var.teams_team_id
  teams_channel_id = var.teams_channel_id

  lambda_functions = {
    initPayment    = module.lambda.function_names["initPayment"]
    processPayment = module.lambda.function_names["processPayment"]
    getDetails     = module.lambda.function_names["getDetails"]
    testCert       = module.lambda.function_names["testCert"]
  }

  lambda_log_group_names = {
    initPayment    = module.lambda.log_group_names["initPayment"]
    processPayment = module.lambda.log_group_names["processPayment"]
    getDetails     = module.lambda.log_group_names["getDetails"]
    testCert       = module.lambda.log_group_names["testCert"]
  }

  api_gateway_access_log_group_name = module.api.access_log_group_name

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

