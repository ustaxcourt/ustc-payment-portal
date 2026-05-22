output "instance_id" {
  description = "EC2 instance ID of the bastion. Use as the --target for `aws ssm start-session`."
  value       = aws_instance.bastion.id
}

output "security_group_id" {
  description = "Security group ID attached to the bastion"
  value       = aws_security_group.bastion.id
}

output "instance_id_ssm_parameter_name" {
  description = "SSM Parameter Store path where the bastion instance ID is published"
  value       = aws_ssm_parameter.bastion_instance_id.name
}
