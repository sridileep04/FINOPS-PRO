from typing import Literal

from pydantic import BaseModel, model_validator


class AuthPayload(BaseModel):
    """Credentials for exactly one AWS account, for exactly one request.
    Never persisted by this service -- used to write a throwaway
    workspace config, then discarded along with the workspace."""

    method: Literal["cross_account_role", "access_keys"]
    region: str = "us-east-1"

    role_arn: str | None = None
    external_id: str | None = None

    access_key_id: str | None = None
    secret_access_key: str | None = None

    @model_validator(mode="after")
    def validate_fields(self):
        if self.method == "cross_account_role":
            if not self.role_arn or not self.external_id:
                raise ValueError("role_arn and external_id are required for cross_account_role")
        else:
            if not self.access_key_id or not self.secret_access_key:
                raise ValueError("access_key_id and secret_access_key are required for access_keys")
        return self


class ExecuteRequest(BaseModel):
    sql: str
    auth: AuthPayload
    # Optional caller-supplied identifier (e.g. account UUID) included only
    # in logs/errors for traceability -- never in place of real auth.
    request_tag: str | None = None


class ExecuteResponse(BaseModel):
    rows: list[dict]
    row_count: int