# The rulesets are a repo-level singleton (one per repo, independent of any AWS
# account). State is parked in the dev backend for convenience; the resources it
# manages are account-agnostic. Applying needs BOTH a GitHub admin credential and
# AWS creds for this backend — see README.md.
bucket       = "ustc-payment-portal-terraform-state-dev"
key          = "ustc-payment-portal/github/rulesets.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
