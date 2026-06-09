environment        = "dev"
name_prefix        = "ustc-payment-portal-dev"
aws_region         = "us-east-1"
github_org         = "ustaxcourt"
github_repo        = "ustc-payment-portal"
state_bucket_name  = "ustc-payment-portal-terraform-state-dev"
lambda_name_prefix = "ustc-payment-processor"

vpc_cidr              = "10.20.0.0/25"
public_subnet_cidr    = "10.20.0.0/28"
private_subnet_cidr   = "10.20.0.32/28"
private_subnet_cidr_2 = "10.20.0.48/28"
availability_zone     = "us-east-1a"
availability_zone_2   = "us-east-1b"

tags = {
  Env     = "dev"
  Project = "ustc-payment-portal"
}

create_artifacts_bucket     = true
build_artifacts_bucket_name = "ustc-payment-portal-build-artifacts"
staging_deployer_role_arn   = "arn:aws:iam::747103385969:role/ustc-payment-processor-stg-cicd-deployer-role"
prod_deployer_role_arn      = "arn:aws:iam::802939326821:role/ustc-payment-processor-prod-cicd-deployer-role"
