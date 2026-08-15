import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MetricSample(Base):
    """One row per (resource, metric, timestamp). Used for utilization
    trend analysis (rightsizing, night-shutdown candidates)."""

    __tablename__ = "metric_samples"
    __table_args__ = (
        UniqueConstraint("aws_account_id", "resource_id", "metric_name", "timestamp", name="uq_metric_sample"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aws_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=False)

    resource_id: Mapped[str] = mapped_column(String(512), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(64), nullable=False)  # cpu_utilization, network_in, ...
    granularity: Mapped[str] = mapped_column(String(16), default="hourly")  # hourly | daily

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    average: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    maximum: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    minimum: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
