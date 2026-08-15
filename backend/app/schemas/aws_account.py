import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.aws_account import AuthMethod, ValidationStatus


class AwsAccountCreateRoleArn(BaseModel):
    """Option 1 in the UI: customer creates an IAM role in their account
    that trusts our platform's AWS account, and shares back the role ARN
    (+ external ID for confused-deputy protection)."""

    account_name: str
    aws_account_id: str = Field(pattern=r"^\d{12}$")
    default_region: str = "us-east-1"
    auth_method: AuthMethod = AuthMethod.CROSS_ACCOUNT_ROLE
    role_arn: str
    external_id: str


class AwsAccountCreateAccessKeys(BaseModel):
    """Option 2 in the UI: customer pastes a long-lived IAM access key /
    secret pair for a read-only IAM user."""

    account_name: str
    aws_account_id: str = Field(pattern=r"^\d{12}$")
    default_region: str = "us-east-1"
    auth_method: AuthMethod = AuthMethod.ACCESS_KEYS
    access_key_id: str
    secret_access_key: str


class AwsAccountCreate(BaseModel):
    """Generic envelope the API accepts; validated into one of the two
    concrete shapes above based on `auth_method`."""

    account_name: str
    aws_account_id: str = Field(pattern=r"^\d{12}$")
    default_region: str = "us-east-1"
    auth_method: AuthMethod

    role_arn: str | None = None
    external_id: str | None = None

    access_key_id: str | None = None
    secret_access_key: str | None = None

    @model_validator(mode="after")
    def validate_fields_for_method(self):
        if self.auth_method == AuthMethod.CROSS_ACCOUNT_ROLE:
            if not self.role_arn or not self.external_id:
                raise ValueError("role_arn and external_id are required for cross_account_role")
        elif self.auth_method == AuthMethod.ACCESS_KEYS:
            if not self.access_key_id or not self.secret_access_key:
                raise ValueError("access_key_id and secret_access_key are required for access_keys")
        return self


class AwsAccountOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    account_name: str
    aws_account_id: str
    default_region: str
    auth_method: AuthMethod
    role_arn: str | None
    validation_status: ValidationStatus
    validation_message: str | None
    last_validated_at: datetime | None
    permission_checked_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True
