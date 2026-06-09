environment        = "stg"
name_prefix        = "ustc-payment-portal-stg"
aws_region         = "us-east-1"
github_org         = "ustaxcourt"
github_repo        = "ustc-payment-portal"
state_bucket_name  = "ustc-payment-portal-terraform-state-stg"
lambda_name_prefix = "ustc-payment-portal-stg"

vpc_cidr              = "10.30.0.0/25"
public_subnet_cidr    = "10.30.0.0/28"
private_subnet_cidr   = "10.30.0.32/28"
private_subnet_cidr_2 = "10.30.0.48/28"
availability_zone     = "us-east-1a"
availability_zone_2   = "us-east-1b"

tags = {
  Env     = "stg"
  Project = "ustc-payment-portal"
}

create_artifacts_bucket = false
