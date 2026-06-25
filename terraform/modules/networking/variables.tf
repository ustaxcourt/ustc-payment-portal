variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones to create subnets and NAT gateways in. Must have at least two entries for HA egress."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 1
    error_message = "availability_zones must have at least one entry."
  }

  validation {
    condition     = var.single_nat_gateway || length(var.availability_zones) >= 2
    error_message = "availability_zones must have at least two entries for HA egress (single_nat_gateway = false)."
  }

  validation {
    condition     = length(var.availability_zones) == length(distinct(var.availability_zones))
    error_message = "availability_zones entries must be unique; duplicate AZs would silently collapse the subnet, NAT, and route-table maps built via zipmap."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets, one per egress AZ. In HA mode (single_nat_gateway = false) this must have one entry per availability_zones entry; in single-NAT mode it needs exactly one entry (for the first AZ)."
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_cidrs) == (var.single_nat_gateway ? 1 : length(var.availability_zones))
    error_message = "public_subnet_cidrs must have exactly one entry in single-NAT mode (single_nat_gateway = true), or one entry per availability_zones entry in HA mode (single_nat_gateway = false)."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the private subnets, one per entry in availability_zones (index-aligned)."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_cidrs) == length(var.availability_zones)
    error_message = "private_subnet_cidrs must have exactly one entry per availability_zones entry (index-aligned). Mismatched lengths cause zipmap to drop entries or emit null CIDRs."
  }
}

variable "single_nat_gateway" {
  description = "When true, provision a single NAT gateway (in the first AZ) shared by all private subnets — cheaper, but not AZ-redundant. When false, provision one NAT gateway + EIP + private route table per AZ for redundant egress."
  type        = bool
  default     = true
}

variable "tags" {
  type = map(string)
}

variable "name_prefix" {
  type = string
}

variable "nat_eip_allocation_ids" {
  description = "Map of AZ name to existing EIP allocation ID for NAT egress. AZs absent from this map will have a new EIP created. Prod sets the allowlisted EIP for us-east-1a so outbound SOAP traffic egresses on the Pay.gov-trusted IP."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for az in keys(var.nat_eip_allocation_ids) : contains(var.availability_zones, az)])
    error_message = "nat_eip_allocation_ids keys must be AZ names present in availability_zones. Check for a typo (e.g. \"us-east-1A\" instead of \"us-east-1a\"); an unmatched key would otherwise be ignored, causing Terraform to allocate a new EIP instead of using the intended one."
  }
}

