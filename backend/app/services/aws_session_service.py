"""
Produces a boto3 Session using whichever auth method the customer chose,
mirroring the credential logic in app.services.steampipe_client but
returning live boto3 credentials instead of writing Steampipe config
files. Used by the permission-probe matrix, where we need many small,
fast, distinct API calls -- spinning up a Steampipe subprocess per probe
would be far slower than reusing one boto3 session.
"""
from __future__ import annotations

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.core.encryption import decrypt_value
from app.models.aws_account import AuthMethod, AwsAccount


class SessionBuildError(RuntimeError):
    """Raised when we could not obtain usable credentials at all -- e.g.
    the trust policy doesn't allow us to assume the role, or the external
    ID doesn't match. `error_code` mirrors the AWS ClientError code so
    callers can give the customer specific remediation guidance."""

    def __init__(self, message: str, error_code: str | None = None):
        super().__init__(message)
        self.error_code = error_code


def _assume_role_session(account: AwsAccount) -> boto3.Session:
    if settings.PLATFORM_AWS_ACCESS_KEY_ID and settings.PLATFORM_AWS_SECRET_ACCESS_KEY:
        source_session = boto3.Session(
            aws_access_key_id=settings.PLATFORM_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.PLATFORM_AWS_SECRET_ACCESS_KEY,
        )
    else:
        # Falls back to the container's own credential chain (ECS task
        # role / EC2 instance profile) -- no static platform key needed.
        source_session = boto3.Session()

    sts = source_session.client("sts", region_name=account.default_region)
    try:
        resp = sts.assume_role(
            RoleArn=account.role_arn,
            RoleSessionName="finops-permission-check",
            ExternalId=decrypt_value(account.external_id),
            DurationSeconds=900,
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        raise SessionBuildError(f"Could not assume role {account.role_arn}: {exc}", error_code=code) from exc

    creds = resp["Credentials"]
    return boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=account.default_region,
    )


def _static_key_session(account: AwsAccount) -> boto3.Session:
    return boto3.Session(
        aws_access_key_id=decrypt_value(account.access_key_id_encrypted),
        aws_secret_access_key=decrypt_value(account.secret_access_key_encrypted),
        region_name=account.default_region,
    )


def get_boto3_session(account: AwsAccount) -> boto3.Session:
    if account.auth_method == AuthMethod.CROSS_ACCOUNT_ROLE:
        return _assume_role_session(account)
    if account.auth_method == AuthMethod.ACCESS_KEYS:
        return _static_key_session(account)
    raise SessionBuildError(f"Unsupported auth method: {account.auth_method}")
