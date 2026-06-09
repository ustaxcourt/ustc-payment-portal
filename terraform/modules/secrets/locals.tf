locals {
  env      = var.environment
  basepath = "ustc/pay-gov/${local.env}"
  tags = merge(var.tags, {
    Project = var.project,
    Env     = local.env
  })
}
