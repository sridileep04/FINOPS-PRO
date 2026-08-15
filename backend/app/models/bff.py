"""Models backing the frontend BFF layer (app/api/frontend).

These are intentionally simple, customer-scoped tables that support the
settings / features / integrations / terraform-drift / agent-daemon
screens in the React app. They complement (and in several places reuse)
the richer scanning/finding/cost pipeline that already exists --
Optimizations, Orphaned Resources and the Waste Radar are all served
straight off `Finding`, not duplicated here.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(128), default="Engineering")
    limit_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    alert_threshold: Mapped[float] = mapped_column(Numeric(4, 3), default=0.8)  # fraction 0-1
    notification_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    metric: Mapped[str] = mapped_column(String(64), default="daily_spend")  # daily_spend | anomaly | baseline_deviation | cpu_usage
    threshold: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FeatureFlag(Base):
    """Per-customer platform feature toggle (Anomaly Radar, Zombie Hunter, ...)."""

    __tablename__ = "feature_flags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    feature_key: Mapped[str] = mapped_column(String(64), nullable=False)  # stable slug, e.g. "anomaly-radar"
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="general")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    impact_metric: Mapped[str] = mapped_column(String(255), default="")
    system_requirements: Mapped[str] = mapped_column(String(255), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class IntegrationStatus(str, enum.Enum):
    NOT_CONNECTED = "not_connected"
    PENDING = "pending"
    CONNECTED = "connected"
    ERROR = "error"


class Integration(Base):
    """Per-customer third-party / cloud-provider connector state, shown on
    the Integrations page. AWS role/key integrations are backed by real
    validation against `AwsAccount` + steampipe; everything else is a
    lightweight connection record (no live GCP/Azure support yet)."""

    __tablename__ = "integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)

    integration_key: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "aws_role"
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # aws | gcp | azure | agent
    category: Mapped[str] = mapped_column(String(32), default="secure")
    status: Mapped[IntegrationStatus] = mapped_column(
        Enum(IntegrationStatus, name="integration_status_enum", values_callable=lambda e: [m.value for m in e]),
        default=IntegrationStatus.NOT_CONNECTED,
    )
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    aws_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="SET NULL"), nullable=True)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TerraformDriftResolution(Base):
    """Records that a detected IaC-drift resource has been triaged
    (imported / deleted / ignored) so it stops showing as open."""

    __tablename__ = "terraform_drift_resolutions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    resource_key: Mapped[str] = mapped_column(String(600), nullable=False)  # f"{aws_account_id}:{resource_id}"
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # import | delete | ignore
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlatformSetting(Base):
    """One JSON blob per customer: anomaly-detection sensitivity, cost
    allocation tag policy, and the cloud-account identifiers shown on the
    FinOps Policies tab."""

    __tablename__ = "platform_settings"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AgentEvent(Base):
    """Log of the simulated edge-collector daemon pushes triggered from
    Settings > CLI Agent, used to render agent status/last-sync."""

    __tablename__ = "agent_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    resources_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnomalyAcknowledgement(Base):
    """Marks a (service, date) cost-anomaly as acknowledged. Anomalies
    themselves are computed on the fly from `daily_costs`, not stored."""

    __tablename__ = "anomaly_acknowledgements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    anomaly_key: Mapped[str] = mapped_column(String(300), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
