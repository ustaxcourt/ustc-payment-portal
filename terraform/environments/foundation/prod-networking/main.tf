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
  source              = "../../../modules/networking"
  vpc_cidr            = "10.40.0.0/25"
  public_subnet_cidr  = "10.40.0.0/28"
  private_subnet_cidr = "10.40.0.32/28"
  availability_zone   = "us-east-1a"
  name_prefix         = "ustc-payment-portal-prod"
  tags = {
    Env     = "prod"
    Project = "ustc-payment-portal"
  }
}

