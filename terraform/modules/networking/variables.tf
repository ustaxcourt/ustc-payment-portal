variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "availability_zone" {
  description = "Availability zone for the subnets"
  type        = string
}

variable "availability_zone_2" {
  description = "Optional availability zone for the second private subnet (for RDS Multi-AZ)"
  type        = string
  default     = ""
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
}

variable "private_subnet_cidr" {
  description = "CIDR block for the private subnet"
  type        = string
}

variable "private_subnet_cidr_2" {
  description = "CIDR block for an optional second private subnet (optional)"
  type        = string
  default     = ""
}

variable "enable_proxy" {
  description = "Create the RDS Proxy security group. Requires a second private subnet in a distinct AZ (availability_zone_2)."
  type        = bool
  default     = true
}

variable "tags" {
  type = map(string)
}

variable "name_prefix" {
  type = string
}

variable "nat_eip_allocation_id" {
  description = "Existing EIP allocation to use for NAT egress. Empty = create a fresh replacement EIP (dev/stg). Prod sets this to the Pay.gov-allowlisted address so outbound SOAP traffic egresses on the trusted IP."
  type        = string
  default     = ""
}

