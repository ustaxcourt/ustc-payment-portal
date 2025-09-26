terraform {
  backend "s3" {}
}

module "lambda" {
  source = "../../modules/lambda"
  lambda_execution_role_arn       = module.iam.lambda_role_arn
  subnet_ids                      = module.networking.private_subnet_id
  security_group_ids              = module.networking.lambda_security_group_id
  api_gateway_execution_arn       = ""  # Configure this once API Gateway is implemented

  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}
