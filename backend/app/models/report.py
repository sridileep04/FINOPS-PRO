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
    from app.models.aws_account import AwsAccount

class ReportType(str, enum.Enum):
    COST_BY_SERVICE = "cost_by_service"
    IDLE_EC2 = "idle_ec2"
    UNATTACHED_EBS = "unattached_ebs"
    UNUSED_EIPS = "unused_eips"
    S3_STORAGE_SUMMARY = "s3_storage_summary"
    UNTAGGED_RESOURCES = "untagged_resources"
    RESOURCE_INVENTORY = "resource_inventory"
    CUSTOM_QUERY = "custom_query"

class ReportStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    aws_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False)

    report_type: Mapped[ReportType] = mapped_column(Enum(ReportType, name="report_type_enum"), nullable=False)
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus, name="report_status_enum"), default=ReportStatus.PENDING)

    params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    aws_account: Mapped["AwsAccount"] = relationship(back_populates="reports")
