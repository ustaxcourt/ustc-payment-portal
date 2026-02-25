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

variable "tags" {
  type = map(string)
}

variable "name_prefix" {
  type = string
}

