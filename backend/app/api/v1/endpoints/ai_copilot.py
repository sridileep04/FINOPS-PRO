from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ingestion import ingest_all_open_findings
from app.ai.service import run_finops_query
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/ai", tags=["ai-copilot"])


class AiQueryRequest(BaseModel):
    message: str


@router.post("/query")
async def ai_query(
    payload: AiQueryRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The LLM-driven replacement/companion for the existing rule-based
    /copilot/chat endpoint. Runs the LangGraph workflow: classify intent
    -> retrieve structured + semantic context -> synthesize an answer.
    """
    return await run_finops_query(db, user, payload.message)


@router.post("/knowledge-base/sync")
async def sync_knowledge_base(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Backfills ai_knowledge_chunks from this customer's currently-open
    findings. Call this once after connecting an account (or hook it into
    the nightly scan task) so the semantic-search half of retrieval has
    something to find. Safe to call repeatedly.
    """
    count = await ingest_all_open_findings(db, user.customer_id)
    return {"status": "ok", "findings_ingested": count}