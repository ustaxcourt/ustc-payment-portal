bucket       = "ustc-payment-portal-terraform-state-dev"
# Intentionally different from backend.hcl (ustc-payment-portal/dev/terraform.tfstate).
# PR workspaces store state at env:/pr-<N>/ustc-payment-portal/terraform.tfstate,
# keeping them isolated from the permanent dev state without path collision.
key          = "ustc-payment-portal/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
