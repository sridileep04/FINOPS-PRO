# Install the required dependencies
```
sudo apt update && sudo apt install -y git unzip curl gnupg lsb-release
```
# AWS CLI v2
```
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install
```
# Terraform (HashiCorp's apt repository)
```
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform
```
# kubectl
```
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -m 0755 kubectl /usr/local/bin/kubectl
```
# Helm
```
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

# Verify
```
aws --version; terraform -version; kubectl version --client; helm version --short; docker --version
aws sts get-caller-identity
```

# Terraform infra s3 creation
```
cd infra/terraform/bootstrap
terraform init       # downloads the AWS provider plugin into .terraform/
terraform plan       # preview only: nothing is created. Read it.
terraform plan -out=tfplan # Use this for a guarantee steps of plan. 
terraform apply      # type "yes". Creates the bucket (cost: cents per month)
terraform output state_bucket
cd ../../..
```

# Verify
```
aws s3 ls | grep finops-tfstate                                                   # the bucket exists
aws s3api get-bucket-versioning --bucket $(terraform -chdir=infra/terraform/bootstrap output -raw state_bucket)   # Status: Enabled
terraform -chdir=infra/terraform/bootstrap plan                                   # "No changes."
```

# The dev stack, foundation and network
```
cp backend.hcl.example backend.hcl
terraform -chdir=../../bootstrap output -raw state_bucket     # copy this value
```
```
terraform init -backend-config=backend.hcl
terraform fmt -check && terraform validate
terraform plan
```
```
terraform init
terraform validate && terraform plan
```

# IAM, so pods and GitHub need no AWS keys
```
mkdir -p policies
curl -fsSL -o policies/aws-load-balancer-controller-iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.6.2/docs/install/iam_policy.json
python3 -m json.tool policies/aws-load-balancer-controller-iam-policy.json > /dev/null && echo "valid JSON"
```

```
terraform fmt -recursive && terraform validate && terraform plan
```
