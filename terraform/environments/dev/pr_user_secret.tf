# Per-PR Postgres user secret. Created only in PR workspaces — the dev workspace
# itself uses the admin credentials. Lifecycle binds to the workspace: terraform
# destroy removes the secret automatically when the PR is closed.
#
# The role and grants are created by the migrationHandler Lambda's provision-user
# command, which reads this secret to learn the username/password.

resource "random_password" "pr_user" {
  count   = local.is_pr ? 1 : 0
  length  = 32
  special = false # avoid URL-encoding/escaping headaches in connection strings
}

resource "aws_secretsmanager_secret" "pr_user" {
  count                   = local.is_pr ? 1 : 0
  name                    = "ustc/pay-gov/dev/${local.environment}-db-user"
  recovery_window_in_days = 0 # PR teardown must be immediate; no soft-delete window

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_secretsmanager_secret_version" "pr_user" {
  count     = local.is_pr ? 1 : 0
  secret_id = aws_secretsmanager_secret.pr_user[0].id
  secret_string = jsonencode({
    username = local.pr_role
    password = random_password.pr_user[0].result
  })
}
