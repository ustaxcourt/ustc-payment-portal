locals {
  env      = var.environment
  basepath = "ustc/pay-gov/${local.env}"
  tags = merge(var.tags, {
    Project = var.project,
    Env     = local.env
  })

  secret_arns_always = [
    aws_secretsmanager_secret.api_access_token.arn,
    aws_secretsmanager_secret.cert_passphrase.arn,
    aws_secretsmanager_secret.paygov_dev_server_token.arn,
  ]
  secret_arns_mtls = concat(
    aws_secretsmanager_secret.private_key[*].arn,
    aws_secretsmanager_secret.certificate[*].arn,
  )
  secret_arns = concat(local.secret_arns_always, local.secret_arns_mtls)

  lambda_exec_role_name = element(
    split("/", var.lambda_exec_role_arn),
    length(split("/", var.lambda_exec_role_arn)) - 1
  )
}
