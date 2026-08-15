import re

from app.core.encryption import encrypt_value
from app.models.aws_account import AuthMethod
from app.schemas.aws_account import AwsAccountCreate

ROLE_ARN_RE = re.compile(r"^arn:aws:iam::\d{12}:role/[\w+=,.@-]+$")


def validate_role_arn_format(role_arn: str) -> None:
    if not ROLE_ARN_RE.match(role_arn):
        raise ValueError("role_arn must look like arn:aws:iam::<account-id>:role/<role-name>")


def build_account_kwargs(payload: AwsAccountCreate) -> dict:
    """Encrypts sensitive fields and returns kwargs ready for the
    AwsAccount ORM model constructor."""
    common = dict(
        account_name=payload.account_name,
        aws_account_id=payload.aws_account_id,
        default_region=payload.default_region,
        auth_method=payload.auth_method,
    )

    if payload.auth_method == AuthMethod.CROSS_ACCOUNT_ROLE:
        validate_role_arn_format(payload.role_arn)
        common.update(
            role_arn=payload.role_arn,
            external_id=encrypt_value(payload.external_id),
        )
    else:
        common.update(
            access_key_id_encrypted=encrypt_value(payload.access_key_id),
            secret_access_key_encrypted=encrypt_value(payload.secret_access_key),
        )
    return common
