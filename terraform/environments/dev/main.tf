terraform {

    backend "s3" {

    }
}

provider "aws" {
    region = var.aws_region

    default_tags {
        tags = {
            Project     = "ustc-payment-portal-dev"
            Environment = "dev"
            ManagedBy   = "terraform"
        }
    }
}


module "template" {
    source = "../../template/"
    
    environment             = "dev"
    tf_state_bucket_name    = ""
    tf_lock_table_name      = "" 
}