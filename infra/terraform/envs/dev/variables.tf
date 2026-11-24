variable "region" {
  description = "AWS region. ap-south-1 (Mumbai) is the closest to you; change if you prefer."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  type    = string
  default = "finops"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "github_repository" {
  description = "owner/repo allowed to push images to ECR via GitHub OIDC."
  type        = string
  default     = "sridileep04/FINOPS-PRO"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "single_nat_gateway" {
  description = "true = one shared NAT gateway (cheap, dev). false = one per AZ (highly available, prod)."
  type        = bool
  default     = true
}

variable "kubernetes_version" {
  description = "EKS control-plane version. Check the EKS release calendar before changing."
  type        = string
  default     = "1.35"
}

variable "node_instance_types" {
  description = "Instance types for the managed node group. The backend/steampipe pods are memory-hungry; t3.large = 8 GiB."
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_capacity_type" {
  description = "ON_DEMAND (stable) or SPOT (~70% cheaper, can be reclaimed with 2 min notice)."
  type        = string
  default     = "ON_DEMAND"
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "eks_public_access_cidrs" {
  description = "Who may reach the PUBLIC Kubernetes API endpoint. 0.0.0.0/0 is convenient for learning (it is still IAM-authenticated); restrict to your IP/32 for anything real."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "eks_deletion_protection" {
  description = "Set true for anything you care about. false lets `terraform destroy` remove the cluster."
  type        = bool
  default     = false
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "GiB"
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Standby replica in a second AZ. true in production (doubles cost)."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  type    = bool
  default = false
}

variable "db_skip_final_snapshot" {
  description = "true is convenient for dev teardown. Set false in prod so a final snapshot is taken on destroy."
  type        = bool
  default     = true
}

variable "secret_recovery_window_days" {
  description = "0 = delete secrets immediately on destroy (so you can re-create the same name). Use 7-30 in prod."
  type        = number
  default     = 0
}

variable "create_github_oidc_provider" {
  description = "An AWS account can have only ONE OIDC provider for token.actions.githubusercontent.com. Set false if it already exists."
  type        = bool
  default     = true
}

variable "ecr_force_delete" {
  description = "true lets `terraform destroy` delete repos that still contain images."
  type        = bool
  default     = true
}

variable "k8s_namespace" {
  description = "Namespace the app runs in. Must match deploy/platform/namespace.yaml and the Helm release."
  type        = string
  default     = "finops"
}