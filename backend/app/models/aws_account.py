import enum
from typing import TYPE_CHECKING
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base
if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.report import Report

class AuthMethod(str, enum.Enum):
    CROSS_ACCOUNT_ROLE = "cross_account_role"
    ACCESS_KEYS = "access_keys"


class ValidationStatus(str, enum.Enum):
    PENDING = "pending"
    VALID = "valid"
    INVALID = "invalid"


class AwsAccount(Base):
    __tablename__ = "aws_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    aws_account_id: Mapped[str] = mapped_column(String(20), nullable=False)
    default_region: Mapped[str] = mapped_column(String(32), default="us-east-1")

    auth_method: Mapped[AuthMethod] = mapped_column(
    Enum(
        AuthMethod,
        name="auth_method_enum",
        values_callable=lambda enum_cls: [member.value for member in enum_cls],
    ),
    nullable=False,
    )
    # -- Cross-account role fields --
    role_arn: Mapped[str | None] = mapped_column(String(512), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # stored encrypted

    # -- Static access key fields (encrypted at rest, see app.core.encryption) --
    access_key_id_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_access_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    validation_status: Mapped[ValidationStatus] = mapped_column(
    Enum(
        ValidationStatus,
        name="validation_status_enum",
        values_callable=lambda enum_cls: [member.value for member in enum_cls],
    ),
    default=ValidationStatus.PENDING,
    )
    validation_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Structured result of the last permission-probe run: which AWS APIs
    # we could actually call with the credentials/role the customer gave
    # us, and which FinOps report types that unlocks. See
    # app.services.permission_check_service.
    permission_report: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    permission_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship(back_populates="aws_accounts")
    reports: Mapped[list["Report"]] = relationship(back_populates="aws_account", cascade="all, delete-orphan")
