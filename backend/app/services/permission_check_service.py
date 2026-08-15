"""
Answers: "what permissions did the customer actually give us, and is their
cross-account role configured correctly?"

Rather than trying to introspect IAM policy documents (which itself
requires IAM read permissions the customer's read-only role may not even
have, and which `iam:SimulatePrincipalPolicy` can't reliably do without
extra grants), we run a battery of small, cheap, real read-only API calls
-- the same calls our report queries actually depend on -- and record
which ones succeed. This is what will actually happen when a report runs,
so it can't be wrong the way a policy-simulation could be.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from app.models.aws_account import AwsAccount
from app.models.report import ReportType
from app.services.aws_session_service import SessionBuildError, get_boto3_session

# Human-readable remediation guidance keyed by the AWS error code returned
# when *assuming the role itself* fails. STS deliberately returns a
# generic AccessDenied for both "wrong trust policy" and "wrong external
# ID", so we can't distinguish those two -- the message below covers both.
ASSUME_ROLE_ERROR_GUIDANCE = {
    "AccessDenied": (
        "The role could not be assumed. Check that: (1) the role's trust "
        "policy Principal exactly matches this platform's AWS account/role "
        "ARN, and (2) the external ID configured on the role's trust "
        "policy condition matches the external ID you entered here."
    ),
    "NoSuchEntity": "The role ARN does not exist in the target account. Double-check the ARN for typos.",
    "InvalidClientTokenId": "This platform's own AWS credentials are invalid -- this is an issue on our side, not yours.",
    "ExpiredToken": "This platform's own AWS credentials have expired -- this is an issue on our side, not yours.",
}


@dataclass
class ProbeResult:
    key: str
    category: str
    action: str
    status: str  # allowed | denied | error
    message: str
    unlocks_report_types: list[str] = field(default_factory=list)


def _run(session: boto3.Session, key: str, category: str, action: str, unlocks: list[str], fn: Callable[[boto3.Session], None]) -> ProbeResult:
    try:
        fn(session)
        return ProbeResult(key, category, action, "allowed", "OK", unlocks)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        if code in ("AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "Forbidden"):
            return ProbeResult(key, category, action, "denied", f"Access denied ({code})", unlocks)
        return ProbeResult(key, category, action, "error", f"{code}: {exc}", unlocks)
    except NoCredentialsError as exc:
        return ProbeResult(key, category, action, "error", str(exc), unlocks)
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(key, category, action, "error", str(exc), unlocks)


def _probe_identity(session):
    session.client("sts").get_caller_identity()


def _probe_cost_explorer(session):
    end = date.today()
    start = end - timedelta(days=1)
    session.client("ce", region_name="us-east-1").get_cost_and_usage(
        TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
    )


def _probe_ec2(session):
    session.client("ec2").describe_instances(MaxResults=5)


def _probe_cloudwatch(session):
    session.client("cloudwatch").list_metrics(Namespace="AWS/EC2", MetricName="CPUUtilization")


def _probe_ebs(session):
    session.client("ec2").describe_volumes(MaxResults=5)


def _probe_eip(session):
    session.client("ec2").describe_addresses()


def _probe_s3(session):
    session.client("s3").list_buckets()


def _probe_rds(session):
    session.client("rds").describe_db_instances(MaxRecords=20)


def _probe_lambda(session):
    session.client("lambda").list_functions(MaxItems=5)


def _probe_security_groups(session):
    session.client("ec2").describe_security_groups(MaxResults=5)


def _probe_tagging(session):
    session.client("resourcegroupstaggingapi").get_resources(ResourcesPerPage=5)


PROBES = [
    ("identity", "Identity", "sts:GetCallerIdentity", [], _probe_identity),
    ("cost_explorer", "Cost Explorer", "ce:GetCostAndUsage",
     [ReportType.COST_BY_SERVICE.value], _probe_cost_explorer),
    ("ec2_describe", "EC2", "ec2:DescribeInstances",
     [ReportType.IDLE_EC2.value, ReportType.RESOURCE_INVENTORY.value, ReportType.UNTAGGED_RESOURCES.value], _probe_ec2),
    ("cloudwatch_metrics", "CloudWatch", "cloudwatch:ListMetrics / GetMetricStatistics",
     [ReportType.IDLE_EC2.value], _probe_cloudwatch),
    ("ebs_describe", "EBS", "ec2:DescribeVolumes",
     [ReportType.UNATTACHED_EBS.value, ReportType.RESOURCE_INVENTORY.value, ReportType.UNTAGGED_RESOURCES.value], _probe_ebs),
    ("eip_describe", "VPC / EIP", "ec2:DescribeAddresses",
     [ReportType.UNUSED_EIPS.value], _probe_eip),
    ("s3_list", "S3", "s3:ListAllMyBuckets",
     [ReportType.S3_STORAGE_SUMMARY.value, ReportType.RESOURCE_INVENTORY.value], _probe_s3),
    ("rds_describe", "RDS", "rds:DescribeDBInstances", [ReportType.RESOURCE_INVENTORY.value], _probe_rds),
    ("lambda_list", "Lambda", "lambda:ListFunctions", [ReportType.RESOURCE_INVENTORY.value], _probe_lambda),
    ("security_groups", "Security", "ec2:DescribeSecurityGroups", [], _probe_security_groups),
    ("tagging_api", "Resource Groups Tagging", "tag:GetResources", [ReportType.UNTAGGED_RESOURCES.value], _probe_tagging),
]

ALL_REPORT_TYPES = [rt.value for rt in ReportType if rt != ReportType.CUSTOM_QUERY]


def run_permission_check(account: AwsAccount) -> dict:
    """Returns a JSON-serializable dict, safe to hand straight to the
    frontend, describing exactly what this account's credentials can and
    cannot do."""
    started = time.time()

    try:
        session = get_boto3_session(account)
    except SessionBuildError as exc:
        guidance = ASSUME_ROLE_ERROR_GUIDANCE.get(exc.error_code, str(exc))
        return {
            "overall_status": "connection_failed",
            "trust_check": {
                "ok": False,
                "error_code": exc.error_code,
                "message": guidance,
            },
            "capabilities": [],
            "supported_report_types": [],
            "unsupported_report_types": ALL_REPORT_TYPES,
            "checked_at_seconds": round(time.time() - started, 2),
        }

    results = [_run(session, key, category, action, unlocks, fn) for key, category, action, unlocks, fn in PROBES]

    identity_result = next(r for r in results if r.key == "identity")
    if identity_result.status != "allowed":
        return {
            "overall_status": "connection_failed",
            "trust_check": {
                "ok": False,
                "error_code": None,
                "message": (
                    "The role/credentials were accepted but sts:GetCallerIdentity itself "
                    f"failed: {identity_result.message}. This is unusual -- please re-check the credentials."
                ),
            },
            "capabilities": [],
            "supported_report_types": [],
            "unsupported_report_types": ALL_REPORT_TYPES,
            "checked_at_seconds": round(time.time() - started, 2),
        }

    caller_identity = session.client("sts").get_caller_identity()

    supported: set[str] = set()
    for r in results:
        if r.status == "allowed":
            supported.update(r.unlocks_report_types)
    unsupported = sorted(set(ALL_REPORT_TYPES) - supported)

    non_identity_results = [r for r in results if r.key != "identity"]
    allowed_count = sum(1 for r in non_identity_results if r.status == "allowed")
    if allowed_count == len(non_identity_results):
        overall_status = "full_access"
    elif allowed_count == 0:
        overall_status = "no_access"
    else:
        overall_status = "partial_access"

    return {
        "overall_status": overall_status,
        "trust_check": {
            "ok": True,
            "error_code": None,
            "message": f"Successfully authenticated as {caller_identity.get('Arn')}",
            "resolved_account_id": caller_identity.get("Account"),
        },
        "capabilities": [
            {
                "key": r.key,
                "category": r.category,
                "action": r.action,
                "status": r.status,
                "message": r.message,
                "unlocks_report_types": r.unlocks_report_types,
            }
            for r in results
        ],
        "supported_report_types": sorted(supported),
        "unsupported_report_types": unsupported,
        "checked_at_seconds": round(time.time() - started, 2),
    }
