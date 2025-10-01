data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket         = "ustc-payment-portal-terraform-state-dev"
    key            = "ustc-payment-portal/dev/networking.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ustc-payment-portal-terraform-locks-dev"
    encrypt        = true
  }
}

module "lambda" {
  source = "../../modules/lambda"
  lambda_execution_role_arn       = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                      = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids              = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

module "api" {
  source = "../../modules/api-gateway"

lambda_function_arns = module.lambda.function_arns
environment   = "dev"
stage_name    = "dev"
allowed_origins = [
  "https://dawson.ustaxcourt.gov"
]

}
