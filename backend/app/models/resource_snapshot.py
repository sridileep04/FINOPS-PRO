import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ResourceSnapshot(Base):
    """One row per (aws_account, resource, snapshot_date). Historized daily
    so downgrade/orphan/security analysis can look back over time instead
    of only ever seeing 'right now'."""

    __tablename__ = "resource_snapshots"
    __table_args__ = (
        UniqueConstraint("aws_account_id", "resource_id", "snapshot_date", name="uq_resource_snapshot_per_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aws_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False)
    scan_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False)

    resource_id: Mapped[str] = mapped_column(String(512), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)  # ec2_instance, ebs_volume, s3_bucket, ...
    region: Mapped[str | None] = mapped_column(String(32), nullable=True)

    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    resource_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # instance_type, state, size, etc.

    estimated_monthly_cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
