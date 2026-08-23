"""enable pgvector and add ai_knowledge_chunks table

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-22

This migration adds the storage layer for the AI/RAG features:
- enables the `vector` extension (pgvector) on the database
- creates `ai_knowledge_chunks`: a single polymorphic table holding
  embedded text chunks sourced from cost reports, anomaly/finding logs,
  optimization recommendations, and (optionally) freeform policy docs.

Design notes
------------
One table, not three. Cost reports, anomaly logs, and recommendations
are all "a paragraph of text about this customer's cloud spend" from
the embedding model's point of view -- they only differ in
`source_type` + `source_id` (which points back at the real row in
`daily_costs` / `findings` / etc). A single table keeps the vector
index simple and lets one similarity search span all of them at once,
which is what the LangGraph retrieval node wants.

Embedding dimension is fixed at 768 (see EMBEDDING_DIM in
app/ai/config.py). pgvector requires the column's dimension to be set
at creation time. If you later switch embedding models to a different
output size, you cannot ALTER this column's dimension in place -- you
would write a follow-up migration that drops and recreates the
`embedding` column (and re-embeds all existing rows).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

EMBEDDING_DIM = 768

SOURCE_TYPE_VALUES = (
    "cost_report",
    "anomaly_log",
    "optimization_recommendation",
    "policy_doc",
)


def upgrade():
    # 1. Enable pgvector. Safe to run repeatedly; requires the `vector`
    #    extension to be available on the Postgres server/image (it ships
    #    with the official pgvector/pgvector Docker images and is
    #    installable via `CREATE EXTENSION` on RDS/Aurora >= the versions
    #    that allowlist it).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Explicitly create the enum safely
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE ai_chunk_source_type_enum AS ENUM (
                'cost_report', 'anomaly_log', 'optimization_recommendation', 'policy_doc'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # Define the column using create_type=False so SQLAlchemy doesn't try to recreate it
    source_type_enum = postgresql.ENUM(
        *SOURCE_TYPE_VALUES, 
        name="ai_chunk_source_type_enum", 
        create_type=False
    )

    op.create_table(
        "ai_knowledge_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "aws_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("aws_accounts.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("source_type", source_type_enum, nullable=False),
        # Points back at the row this chunk was derived from (e.g. a
        # Finding.id or a Report.id). Intentionally not a real FK since it
        # can reference different tables depending on source_type.
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("meta", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Scoping index: almost every query filters by customer (+ often
    # source_type) before it ever touches the vector column.
    op.create_index(
        "ix_ai_knowledge_chunks_customer_source",
        "ai_knowledge_chunks",
        ["customer_id", "source_type"],
    )

    # HNSW index for cosine-distance similarity search (pgvector >= 0.5.0).
    # HNSW builds incrementally and doesn't need a post-load ANALYZE/tuning
    # pass the way IVFFlat does, which makes it the simpler default for a
    # table that grows continuously (new cost reports/findings every day).
    op.execute(
        """
        CREATE INDEX ix_ai_knowledge_chunks_embedding_hnsw
        ON ai_knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_ai_knowledge_chunks_embedding_hnsw")
    op.drop_index("ix_ai_knowledge_chunks_customer_source", table_name="ai_knowledge_chunks")
    op.drop_table("ai_knowledge_chunks")
    postgresql.ENUM(name="ai_chunk_source_type_enum").drop(op.get_bind(), checkfirst=True)
    # Deliberately not dropping the `vector` extension -- other tables/
    # migrations may come to depend on it, and DROP EXTENSION would fail
    # loudly at the first sign of that anyway.