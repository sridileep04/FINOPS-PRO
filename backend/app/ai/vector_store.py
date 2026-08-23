import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.config import ai_settings
from app.ai.embeddings import embed_text, embed_texts
from app.models.ai_knowledge_chunk import AiKnowledgeChunk, KnowledgeSourceType


async def add_chunks(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID,
    source_type: KnowledgeSourceType,
    texts: list[str],
    aws_account_id: uuid.UUID | None = None,
    source_id: uuid.UUID | None = None,
    metadata: dict | None = None,
    commit: bool = True,
) -> list[AiKnowledgeChunk]:
    """Embeds `texts` and stores each as one row. `texts` should already be
    reasonably sized chunks (a paragraph, a finding's description+recommendation,
    a day's cost summary) -- this function does not itself split long documents.
    """
    vectors = await embed_texts(texts)
    rows = []
    for i, (text, vector) in enumerate(zip(texts, vectors)):
        row = AiKnowledgeChunk(
            id=uuid.uuid4(),
            customer_id=customer_id,
            aws_account_id=aws_account_id,
            source_type=source_type,
            source_id=source_id,
            chunk_index=i,
            content=text,
            embedding=vector,
            meta=metadata,
        )
        db.add(row)
        rows.append(row)

    if commit:
        await db.commit()
    return rows


async def similarity_search(
    db: AsyncSession,
    *,
    customer_id: uuid.UUID,
    query: str,
    source_types: list[KnowledgeSourceType] | None = None,
    aws_account_id: uuid.UUID | None = None,
    top_k: int | None = None,
) -> list[AiKnowledgeChunk]:
    """Embeds `query` and returns the top_k most similar chunks scoped to this
    customer. This is the "vector search for unstructured policy/logs" half
    of the dual-retrieval step in the LangGraph workflow.
    """
    query_vector = await embed_text(query)
    top_k = top_k or ai_settings.SEMANTIC_TOP_K

    stmt = (
        select(AiKnowledgeChunk)
        .where(AiKnowledgeChunk.customer_id == customer_id)
        # cosine_distance() is provided by pgvector's SQLAlchemy Vector type;
        # it compiles to the `<=>` operator. Smaller distance = more similar,
        # so we order ascending and take the first top_k.
        .order_by(AiKnowledgeChunk.embedding.cosine_distance(query_vector))
        .limit(top_k)
    )
    if source_types:
        stmt = stmt.where(AiKnowledgeChunk.source_type.in_(source_types))
    if aws_account_id:
        stmt = stmt.where(AiKnowledgeChunk.aws_account_id == aws_account_id)

    result = await db.execute(stmt)
    return list(result.scalars().all())