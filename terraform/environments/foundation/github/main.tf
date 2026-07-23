terraform {
  required_version = "~> 1.15.0"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }

  backend "s3" {}
}

locals {
  github_owner           = "ustaxcourt"
  github_repo            = "ustc-payment-portal"
  required_check_context = "Integration Gate" # must match the integration_gate job in cicd-dev.yml
  github_actions_app_id  = 15368
}

provider "github" {
  owner = local.github_owner
}

# No bypass: the test gate applies to everyone, admins included. Review is enforced
# separately by the hand-managed "merge to main" ruleset (rulesets stack).
resource "github_repository_ruleset" "main_tests" {
  name        = "main-tests"
  repository  = local.github_repo
  target      = "branch"
  enforcement = var.enforcement

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      required_approving_review_count = 0
    }

    required_status_checks {
      strict_required_status_checks_policy = true

      required_check {
        context        = local.required_check_context
        integration_id = local.github_actions_app_id # pin to GitHub Actions so the check can't be spoofed
      }
    }
  }
}
