data "aws_iam_policy_document" "pods_trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

locals {
  app_service_accounts = {
    backend   = "finops-backend"   # API + Celery worker + Celery beat
    steampipe = "finops-steampipe" # steampipe-service
  }
}

data "aws_iam_policy_document" "assume_customer_roles" {
  statement {
    sid       = "AssumeCustomerCrossAccountRoles"
    actions   = ["sts:AssumeRole"]
    resources = ["arn:aws:iam::*:role/*"]
  }
}

resource "aws_iam_role" "app" {
  for_each = local.app_service_accounts

  name               = "${local.name}-pod-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.pods_trust.json
}

resource "aws_iam_role_policy" "app" {
  for_each = aws_iam_role.app

  name   = "assume-customer-roles"
  role   = each.value.id
  policy = data.aws_iam_policy_document.assume_customer_roles.json
}

resource "aws_eks_pod_identity_association" "app" {
  for_each = local.app_service_accounts

  cluster_name    = module.eks.cluster_name
  namespace       = var.k8s_namespace
  service_account = each.value
  role_arn        = aws_iam_role.app[each.key].arn
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      aws_secretsmanager_secret.app.arn,
      aws_secretsmanager_secret.llm.arn,
    ]
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${local.name}-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.pods_trust.json
}

resource "aws_iam_role_policy" "external_secrets" {
  name   = "read-finops-secrets"
  role   = aws_iam_role.external_secrets.id
  policy = data.aws_iam_policy_document.external_secrets.json
}

resource "aws_eks_pod_identity_association" "external_secrets" {
  cluster_name    = module.eks.cluster_name
  namespace       = "external-secrets"
  service_account = "external-secrets"
  role_arn        = aws_iam_role.external_secrets.arn
}

resource "aws_iam_policy" "lbc" {
  name   = "${local.name}-aws-load-balancer-controller"
  policy = file("${path.module}/policies/aws-load-balancer-controller-iam-policy.json")
}

resource "aws_iam_role" "lbc" {
  name               = "${local.name}-aws-load-balancer-controller"
  assume_role_policy = data.aws_iam_policy_document.pods_trust.json
}

resource "aws_iam_role_policy_attachment" "lbc" {
  role       = aws_iam_role.lbc.name
  policy_arn = aws_iam_policy.lbc.arn
}

resource "aws_eks_pod_identity_association" "lbc" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.lbc.arn
}