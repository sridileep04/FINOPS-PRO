
# Summary

- The platform uses a single IAM Role (`PlatformFinOpsRole`) attached to its EC2 instance.
- Customers create a read-only IAM Role (`FinOpsReadOnlyRole`) in their own AWS account.
- The customer role trusts the platform AWS account and uses an External ID for added security.
- The platform stores only the Role ARN, External ID, and account metadata—never long-lived AWS credentials.
- During each scan, the platform calls `sts:AssumeRole`, receives temporary credentials, and uses them to query the customer's AWS environment with boto3 or Steampipe.
- This architecture is secure, scalable, and follows AWS best practices for multi-account SaaS and FinOps platforms.

# Create the below role and attach it to the ec2 instance you are running
# Platformfinopsrole
## Trust relationship
'''
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
'''
## Permissions policies
'''
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": "sts:AssumeRole",
			"Resource": "*"
		}
	]
}
'''
# Now we are moving to customer end
## customerfinopspermissions
### Permissions
'''
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "CostManagementAndExplorerReadOnly",
			"Effect": "Allow",
			"Action": [
				"ce:Get*",
				"ce:Describe*",
				"ce:List*",
				"bcm-data-exports:Get*",
				"bcm-data-exports:List*"
			],
			"Resource": "*"
		},
		{
			"Sid": "ComputeAndStorageReadOnly",
			"Effect": "Allow",
			"Action": [
				"ec2:Describe*",
				"ec2:Get*",
				"rds:Describe*",
				"rds:ListTagsForResource",
				"lambda:List*",
				"lambda:Get*",
				"ecs:Describe*",
				"ecs:List*",
				"eks:Describe*",
				"eks:List*",
				"s3:GetBucketLocation",
				"s3:GetBucketTagging",
				"s3:ListAllMyBuckets",
				"s3:ListBucket"
			],
			"Resource": "*"
		},
		{
			"Sid": "MonitoringAndGovernanceReadOnly",
			"Effect": "Allow",
			"Action": [
				"cloudwatch:Describe*",
				"cloudwatch:Get*",
				"cloudwatch:List*",
				"tag:GetResources",
				"tag:GetTagKeys",
				"tag:GetTagValues"
			],
			"Resource": "*"
		},
		{
			"Sid": "MetadataAndOptionalServicesReadOnly",
			"Effect": "Allow",
			"Action": [
				"iam:Get*",
				"iam:List*",
				"organizations:Describe*",
				"organizations:List*",
				"trustedadvisor:Describe*",
				"support:Describe*"
			],
			"Resource": "*"
		}
	]
}
'''
### Trust relationship
'''
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::236782813501:role/finopsplatformRole"
            },
            "Action": "sts:AssumeRole",
            "Condition": {
                "StringEquals": {
                    "sts:ExternalId": "finops-test-123"
                }
            }
        }
    ]
}
'''
### Option 1: Cross-account IAM role (recommended)

Have the customer create a role in their account that trusts your
platform's AWS account/identity, with an external ID, e.g.:

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::<your-platform-account-id>:root" },
  "Action": "sts:AssumeRole",
  "Condition": { "StringEquals": { "sts:ExternalId": "<generated-external-id>" } }
}
```

attached to a policy such as `ReadOnlyAccess` or a tighter, cost/inventory
scoped policy. Then:

```bash
curl -X POST http://localhost:8001/api/v1/aws-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "account_name": "Customer Prod",
    "aws_account_id": "123456789012",
    "auth_method": "cross_account_role",
    "role_arn": "arn:aws:iam::123456789012:role/FinOpsReadOnlyRole",
    "external_id": "generated-external-id"
  }'
```

By default the backend assumes this role using **the container's own IAM
role** (`PLATFORM_CREDENTIAL_SOURCE=EcsContainer` in `.env`, works out of
the box on ECS; use `Ec2InstanceMetadata` on EC2) -- no long-lived platform
credentials are stored anywhere. If you're not running on AWS compute, set
`PLATFORM_AWS_ACCESS_KEY_ID` / `PLATFORM_AWS_SECRET_ACCESS_KEY` to a static
IAM user instead.

### Option 2: Static access keys

```bash
curl -X POST http://localhost:8001/api/v1/aws-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "account_name": "Customer Sandbox",
    "aws_account_id": "210987654321",
    "auth_method": "access_keys",
    "access_key_id": "AKIA...",
    "secret_access_key": "..."
  }'
```

# AWS Cross-Account Onboarding

This document explains how the AWS cross-account onboarding works in the FinOps platform, what needs to be configured on the platform side, what the customer needs to configure, and how the authentication flow works.

---

# Architecture Overview

The platform runs on an AWS EC2 instance. The EC2 instance has an IAM Role attached to it. This IAM Role is used only to call the AWS Security Token Service (STS) to assume a role inside customer AWS accounts.

The customer creates a read-only IAM Role inside their AWS account that trusts the platform AWS account.

Whenever the platform needs to collect inventory or cost information, it assumes the customer's IAM role and receives temporary AWS credentials.

No customer AWS Access Keys or Secret Keys are permanently stored.

```
                     Customer AWS Account
             +------------------------------------+
             |                                    |
             |  IAM Role                          |
             |  FinOpsReadOnlyRole                |
             |                                    |
             |  Trust Policy                      |
             |  Trusts Platform AWS Account       |
             |                                    |
             +----------------+-------------------+
                              ^
                              |
                         AssumeRole API
                              |
                              |
             +----------------+------------------+
             |                                   |
             |        Platform AWS Account       |
             |                                   |
             |   EC2 Instance                    |
             |   FastAPI                         |
             |   Steampipe                       |
             |                                   |
             |   IAM Role                        |
             |   PlatformFinOpsRole              |
             |                                   |
             +-----------------------------------+
```

---

# Why Cross-Account IAM Role?

Using Cross-Account IAM Roles is the AWS recommended approach because:

- No long-lived AWS credentials are stored.
- Credentials are temporary.
- Customer can revoke access anytime.
- More secure than Access Keys.
- Suitable for production environments.
- Scales to thousands of customer accounts.

---

# Platform Setup

## Step 1 - Create an IAM Role

Open AWS Console

```
IAM
    └── Roles
            └── Create Role
```

Choose

```
Trusted Entity

AWS Service
```

Select

```
EC2
```

Click **Next**.

---

## Step 2 - Attach Permissions

The EC2 IAM Role requires permission to call STS AssumeRole.

Example IAM Policy

```json
{
    "Version":"2012-10-17",
    "Statement":[
        {
            "Effect":"Allow",
            "Action":"sts:AssumeRole",
            "Resource":"*"
        }
    ]
}
```

For production, replace `"*"` with specific customer role ARNs whenever possible.

Example Role Name

```
PlatformFinOpsRole
```

---

## Step 3 - Attach IAM Role to EC2

Open

```
EC2 Console
```

Select the EC2 Instance

Choose

```
Actions
    └── Security
            └── Modify IAM Role
```

Select

```
PlatformFinOpsRole
```

Click

```
Update IAM Role
```

The EC2 instance now automatically receives temporary AWS credentials.

---

# How EC2 Gets Credentials

Once the IAM Role is attached, AWS automatically provides temporary credentials through the Instance Metadata Service (IMDS).

These credentials are automatically rotated by AWS.

The application does not need to manage credentials.

Verify the attached IAM Role

```bash
1. TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

2. curl -H "X-aws-ec2-metadata-token: $TOKEN" \
http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Example Output

```
PlatformFinOpsRole
```

Retrieve Temporary Credentials

```bash
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
http://169.254.169.254/latest/meta-data/iam/security-credentials/PlatformFinOpsRole
```
or
'''
# 1. Refresh your IMDSv2 token
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# 2. Automatically grab the exact role name
ROLE_NAME=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/)
echo "Using Role Name: $ROLE_NAME"

# 3. Fetch the credentials using the exact name
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/$ROLE_NAME
'''
Example

```json
{
  "AccessKeyId":"ASIA....",
  "SecretAccessKey":"********",
  "Token":"********",
  "Expiration":"2026-08-04T04:15:00Z"
}
```

These credentials are automatically used by boto3.

---

# Customer Onboarding

The customer needs to create one IAM Role inside their AWS account.

Role Name

```
FinOpsReadOnlyRole
```

---

## Trust Policy

Replace the AWS Account ID with your Platform AWS Account ID.

Replace the External ID with the value generated by your platform.

```json
{
  "Version":"2012-10-17",
  "Statement":[
    {
      "Effect":"Allow",
      "Principal":{
        "AWS":"arn:aws:iam::<PLATFORM_ACCOUNT_ID>:root"
      },
      "Action":"sts:AssumeRole",
      "Condition":{
        "StringEquals":{
          "sts:ExternalId":"<GENERATED_EXTERNAL_ID>"
        }
      }
    }
  ]
}
```

---

## Permissions Policy

For initial testing

Attach AWS Managed Policy

```
ReadOnlyAccess
```

For production environments, replace this with a custom least-privilege policy containing only the permissions required for:

- Cost Explorer
- EC2
- EBS
- RDS
- Lambda
- ECS
- EKS
- S3
- CloudWatch
- IAM (Read Only)
- Organizations (Optional)
- Trusted Advisor (Optional)

---

# Information Required From Customer

The onboarding UI should collect the following information.

| Field | Example |
|---------|----------|
| Account Name | Production |
| AWS Account ID | 123456789012 |
| Role ARN | arn:aws:iam::123456789012:role/FinOpsReadOnlyRole |
| External ID | generated-random-id |

---

# Authentication Flow

```
Customer clicks

Add AWS Account

↓

Customer creates IAM Role

↓

Customer enters

Role ARN

↓

FastAPI stores

Role ARN
External ID

↓

Scheduler starts

↓

FastAPI reads Role ARN

↓

STS AssumeRole

↓

AWS validates Trust Policy

↓

Temporary Credentials Returned

↓

Steampipe Uses Temporary Credentials

↓

Inventory Collection

↓

Generate Reports

↓

Credentials Expire Automatically
```

---

# FastAPI AssumeRole Example

```python
import boto3

sts = boto3.client("sts")

response = sts.assume_role(
    RoleArn="arn:aws:iam::123456789012:role/FinOpsReadOnlyRole",
    RoleSessionName="finops-session",
    ExternalId="generated-external-id"
)

credentials = response["Credentials"]
```

AWS returns

```python
credentials = {
    "AccessKeyId": "...",
    "SecretAccessKey": "...",
    "SessionToken": "..."
}
```

These credentials are valid only for a limited duration (typically one hour).

---

# Using Temporary Credentials

Create a boto3 session

```python
import boto3

session = boto3.Session(
    aws_access_key_id=credentials["AccessKeyId"],
    aws_secret_access_key=credentials["SecretAccessKey"],
    aws_session_token=credentials["SessionToken"],
)
```

Or configure Steampipe to use these temporary credentials.

---

# Customer Workflow

1. Login to the FinOps Platform.
2. Click **Add AWS Account**.
3. Select **Cross Account IAM Role**.
4. Platform generates an External ID.
5. Customer creates the IAM Role using the provided Trust Policy.
6. Customer copies the Role ARN.
7. Customer submits the onboarding form.
8. Platform validates the configuration.
9. Platform stores the onboarding information.
10. Scheduled scans automatically use STS AssumeRole to collect data.

---

# Security Benefits

- No customer AWS Access Keys stored.
- Temporary credentials only.
- Customer controls access.
- Customer can revoke access anytime.
- Uses AWS Security Token Service (STS).
- Supports multi-tenant architecture.
- Follows AWS security best practices.
- Suitable for production deployments.

---

# Multi-Tenant Flow

```
                   Platform AWS Account

                          EC2
                           │
                           │
                   PlatformFinOpsRole
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
      AssumeRole     AssumeRole     AssumeRole
            │              │              │
            ▼              ▼              ▼
     Customer A     Customer B     Customer C
      AWS Account    AWS Account    AWS Account
            │              │              │
            ▼              ▼              ▼
     Read Resources Read Resources Read Resources
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                    Generate Reports
```
## Build docker image
'''
docker build -t steampipe-custom .
'''
## Command to run a docker image
'''
docker run -d \
  --name steampipe-service \
  --restart unless-stopped \
  -p 8001:8001 \
  -e STEAMPIPE_SERVICE_TOKEN='e739b1599f1f5589b3c745b41f34f218db94451f9e462e273515b90c374a0404' \
  -e STEAMPIPE_INSTALL_DIR='/home/steampipe/.steampipe' \
  -e STEAMPIPE_WORKSPACES_DIR='/home/steampipe/workspaces' \
  -e PLATFORM_CREDENTIAL_SOURCE='Ec2InstanceMetadata' \
  steampipe-custom
  '''