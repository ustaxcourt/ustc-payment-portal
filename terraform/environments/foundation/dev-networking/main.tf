terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = "us-east-1"
}

module "networking" {
  source                = "../../../modules/networking"
  vpc_cidr              = "10.20.0.0/25"
  public_subnet_cidr    = "10.20.0.0/28"
  private_subnet_cidr   = "10.20.0.32/28"
  private_subnet_cidr_2 = "10.20.0.48/28"
  availability_zone     = "us-east-1a"
  availability_zone_2   = "us-east-1b"

  name_prefix = "ustc-payment-portal-dev"
  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

module "iam" {
  source      = "../../../modules/iam"
  name_prefix = "ustc-payment-portal-dev"
  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

