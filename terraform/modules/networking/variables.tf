variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones to create subnets and NAT gateways in. Must have at least two entries for HA egress."
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets, one per entry in availability_zones (index-aligned)."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the private subnets, one per entry in availability_zones (index-aligned)."
  type        = list(string)
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
}

