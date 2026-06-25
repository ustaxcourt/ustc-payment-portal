---
"@ustaxcourt/payment-portal": minor
---

### Networking module (single-NAT and HA topologies)

- Refactored [terraform/modules/networking](terraform/modules/networking) from hardcoded single-AZ resources to AZ-list-driven `for_each` resources.
- New `single_nat_gateway` variable in [variables.tf](terraform/modules/networking/variables.tf) (default `true`). Replaced singular `availability_zone`/`*_subnet_cidr` inputs with `availability_zones`, `public_subnet_cidrs`, `private_subnet_cidrs` lists and a `nat_eip_allocation_ids` map.
- [main.tf](terraform/modules/networking/main.tf) `locals` derive `nat_azs` and `private_rt_az`: in single-NAT mode one NAT/EIP/public subnet/private route table is shared by all private subnets; in HA mode each AZ gets its own NAT, EIP, public subnet, and private route table, with each private subnet routing through its own AZ's NAT.
- `aws_db_subnet_group.rds` and `aws_security_group.rds` are now unconditional and reference all private subnets.

### State migration (no destroy/recreate)

- New [moved.tf](terraform/modules/networking/moved.tf) maps the old singular resource addresses to the new keyed addresses. Blocks are mode-agnostic (they target AZ-a resources plus the AZ-b private subnet, which exist in both modes), so no environment plans a destroy.
- Per-environment EIP `moved` blocks live in each foundation root (divergent targets): dev/stg → `nat["us-east-1a"]`; prod reuses its previously-dangling Elastic IP as `nat["us-east-1b"]`.

### Foundation roots (per-environment posture)

- dev ([dev-networking/main.tf](terraform/environments/foundation/dev-networking/main.tf)) and stg ([stg-networking/main.tf](terraform/environments/foundation/stg-networking/main.tf)): `single_nat_gateway = true`, one public CIDR. Two private subnets retained for the RDS subnet group.
- prod ([prod-networking/main.tf](terraform/environments/foundation/prod-networking/main.tf)): `single_nat_gateway = false`, two public CIDRs. AZ-a pins the Pay.gov-allowlisted EIP `eipalloc-008587cebd5d34afb`; AZ-b reuses the existing dangling EIP.
- All three foundation `outputs.tf` now expose `private_subnet_ids`.

### Terraform Plan GitHub Action
- Updates some of the actions used by `terraform-plan.yml`, specifically `aws-actions/configure-aws-credentials`, `actions/upload-artifact`, and `actions/checkout` from v4 to v6.

### Application stacks (Lambda placement)

- dev/stg Lambdas remain on the single AZ-a private subnet ([dev](terraform/environments/dev/main.tf), [stg](terraform/environments/stg/main.tf)).
- prod Lambdas span both private subnets via `private_subnet_ids` ([prod/main.tf](terraform/environments/prod/main.tf)).
