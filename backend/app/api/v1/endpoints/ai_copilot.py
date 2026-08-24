from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ingestion import ingest_all_open_findings
from app.ai.service import run_finops_query
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/ai", tags=["ai-copilot"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AiQueryRequest(BaseModel):
    message: str
    # Prior turns of this conversation, oldest first. The frontend should
    # send its existing `messages` state here (minus the just-typed
    # message, which goes in `message` above) -- without it, every call
    # is classified with zero memory of what was already asked/answered.
    history: list[ChatTurn] = Field(default_factory=list)


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
    history = [turn.model_dump() for turn in payload.history]
    return await run_finops_query(db, user, payload.message, history=history)


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