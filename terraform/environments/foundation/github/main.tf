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
  required_check_context = "Integration Gate" # must match the integration_gate job name in cicd-dev.yml

  # Fixed GitHub platform ids — constant across all github.com orgs.
  github_actions_app_id = 15368 # first-party GitHub Actions app
  dependabot_app_id     = 29110 # first-party Dependabot app
  admin_role_id         = 5     # built-in repo role: 5 = admin
}

# Auth is supplied out-of-band (never in state/VCS): a GitHub App
# (GITHUB_APP_ID / GITHUB_APP_INSTALLATION_ID / GITHUB_APP_PEM_FILE) or a PAT with
# repo administration:write in GITHUB_TOKEN. See README.md.
provider "github" {
  owner = local.github_owner
}

# main-tests — applies to EVERYONE, no bypass. This is the AC: nobody, including
# admins, can merge to main without the Integration Gate passing. It also requires
# a PR (0 approvals), which blocks direct pushes to main.
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
        context = local.required_check_context
        # Pin to the GitHub Actions app so no other app / raw commit-status can
        # spoof a green gate.
        integration_id = local.github_actions_app_id
      }
    }
  }
}

# main-review — requires 1 approving review, but admins and Dependabot bypass it.
# Because bypass is per-ruleset, the review requirement is kept OUT of main-tests:
# bypassing this ruleset never lets anyone skip the Integration Gate.
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
