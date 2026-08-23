import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base

# Must match EMBEDDING_DIM in app/ai/config.py and the dimension baked
# into the 0006 migration. Kept as a constant here (not imported from
# app.ai.config) so this model has no import-time dependency on the AI
# settings module -- alembic env.py only needs app.models, not app.ai.
EMBEDDING_DIM = 768


class KnowledgeSourceType(str, enum.Enum):
    COST_REPORT = "cost_report"
    ANOMALY_LOG = "anomaly_log"
    OPTIMIZATION_RECOMMENDATION = "optimization_recommendation"
    POLICY_DOC = "policy_doc"


class AiKnowledgeChunk(Base):
    """One embedded chunk of text, scoped to a customer (and optionally
    one of their AWS accounts), used for semantic (vector) retrieval by
    the LangGraph FinOps agent.

    `source_type` + `source_id` trace the chunk back to the structured
    row it was generated from -- e.g. a `cost_report` chunk's
    `source_id` is a `Report.id`, an `optimization_recommendation`
    chunk's `source_id` is a `Finding.id`. This keeps the vector store
    as a derived index rather than a second source of truth: the
    structured tables (`daily_costs`, `findings`, `reports`, ...) stay
    authoritative, and this table exists purely to make their narrative
    text (descriptions, recommendations, log lines) semantically
    searchable.
    """

    __tablename__ = "ai_knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    aws_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("aws_accounts.id", ondelete="CASCADE"), nullable=True
    )

    source_type: Mapped[KnowledgeSourceType] = mapped_column(
        Enum(KnowledgeSourceType, name="ai_chunk_source_type_enum"), nullable=False
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())