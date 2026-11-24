output "region" {
  value = var.region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "kubeconfig_command" {
  description = "Run this to point kubectl at the new cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "vpc_cidr" {
  value = module.vpc.vpc_cidr_block
}

output "ecr_registry" {
  value = local.ecr_host
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "github_ci_role_arn" {
  description = "Set as the GitHub repo variable AWS_ROLE_ARN."
  value       = aws_iam_role.github_ci.arn
}

output "app_pod_role_arns" {
  description = "Customers must trust THESE roles in their cross-account role's trust policy."
  value       = { for k, r in aws_iam_role.app : k => r.arn }
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "app_secret_name" {
  value = aws_secretsmanager_secret.app.name
}

output "llm_secret_name" {
  value = aws_secretsmanager_secret.llm.name
}