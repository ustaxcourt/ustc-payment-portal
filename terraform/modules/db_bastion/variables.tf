variable "name_prefix" {
  description = "Prefix for resource names (e.g. ustc-payment-processor)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the bastion runs (must be the same VPC as RDS)"
  type        = string
}

variable "private_subnet_id" {
  description = "Private subnet ID for the bastion. Must have NAT egress so the SSM agent can reach ssm/ec2messages/ssmmessages endpoints."
  type        = string
}

variable "rds_security_group_id" {
  description = "Security group ID attached to RDS. The module adds an ingress rule on this SG allowing 5432 from the bastion SG."
  type        = string
}

variable "rds_port" {
  description = "Port the database listens on"
  type        = number
  default     = 5432
}

variable "instance_id_ssm_parameter_name" {
  description = "SSM Parameter Store path where the bastion's EC2 instance ID is published. Must match the path the IAM policy allows ssm:PutParameter on."
  type        = string
  default     = "/ustc/pay-gov/dev/rds-bastion-instance-id"
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
