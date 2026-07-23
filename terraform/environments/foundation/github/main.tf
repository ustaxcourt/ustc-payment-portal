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

  # Fixed GitHub platform ids, constant across github.com orgs.
  github_actions_app_id = 15368
  dependabot_app_id     = 29110
  admin_role_id         = 5 # built-in repo role: 5 = admin
}

# Auth via a GitHub App or a GITHUB_TOKEN PAT with repo `administration: write`; see README.md.
provider "github" {
  owner = local.github_owner
}

# No bypass: the test gate applies to everyone, admins included. Requiring a PR
# (0 approvals) also blocks direct pushes to main.
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

# Review requirement, kept separate from main_tests so admins and Dependabot can
# bypass review without ever bypassing the test gate (bypass is per-ruleset).
resource "github_repository_ruleset" "main_review" {
  name        = "main-review"
  repository  = local.github_repo
  target      = "branch"
  enforcement = var.enforcement

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  bypass_actors {
    actor_id    = local.admin_role_id
    actor_type  = "RepositoryRole"
    bypass_mode = "always"
  }

  bypass_actors {
    actor_id    = local.dependabot_app_id
    actor_type  = "Integration"
    bypass_mode = "always"
  }

  rules {
    pull_request {
      required_approving_review_count = 1
    }
  }
}
