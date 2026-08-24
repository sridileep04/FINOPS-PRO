"""Each function here is one LangGraph node. A node is just:

    async def my_node(state: FinOpsAgentState) -> dict:
        ...
        return {"some_field": new_value}   # partial update, merged into state

The `db` (AsyncSession) and `user` aren't part of the persisted graph
state on purpose -- they're request-scoped objects (a DB session, an
authenticated user) that shouldn't be treated as data the graph
reasons over or that a checkpointer would try to serialize. We inject
them via `functools.partial` when building the graph in graph.py, so
each node still has the plain `(state) -> dict` signature LangGraph
expects, but closes over the real session/user for this request.
"""
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graph.state import FinOpsAgentState
from app.ai.llm_client import chat_completion
from app.ai.vector_store import similarity_search
from app.models.finding import FindingType
from app.models.user import User
from app.services import bff_helpers as bh

_INTENT_SYSTEM_PROMPT = """You are the intent classifier for a FinOps assistant.
Classify the user's LATEST message into exactly one of:
- "waste": asking about orphaned/unused/zombie resources
- "savings": asking about optimization opportunities or how to cut spend
- "forecast": asking about projected/future spend, month-end bill
- "anomaly": asking about a cost spike, anomaly, or unexpected charge
- "general": anything else answerable from overall spend context
- "needs_clarification": the question is too vague to answer usefully
  even after considering the conversation so far (e.g. it names no
  account, service, or time period anywhere in this conversation, or
  isn't about cloud cost/FinOps at all)

You will be shown the recent conversation, oldest first, followed by the
user's latest message. IMPORTANT: if an earlier assistant turn asked a
clarifying question (e.g. "which account?") and the latest user message
is a short, direct answer to it (an account id, a service name, "all",
a date range, etc.), resolve the two together and classify the combined
intent -- do NOT return "needs_clarification" again just because the
latest message alone looks short or ambiguous in isolation.

Respond ONLY with JSON: {"intent": "<one of the above>", "clarification_question": "<question to ask the user, or null>"}
"""


async def parse_intent_node(state: FinOpsAgentState) -> dict:
    """Node 1: classify what the user actually wants, so downstream nodes
    know which structured queries to run and whether to even proceed.
    """
    messages = [{"role": "system", "content": _INTENT_SYSTEM_PROMPT}]
    # Cap at the last 6 turns (3 user + 3 assistant) -- enough to resolve a
    # short follow-up answer without letting an old, unrelated part of the
    # conversation quietly bias today's classification.
    messages.extend(state.get("history", [])[-6:])
    messages.append({"role": "user", "content": state["query"]})

    raw = await chat_completion(messages, json_mode=True)
    try:
        parsed = json.loads(raw)
        intent = parsed.get("intent", "general")
        clarification = parsed.get("clarification_question")
    except (json.JSONDecodeError, AttributeError):
        # LLM misbehaved -- fail open into "general" rather than crashing the graph.
        intent, clarification = "general", None

    return {"intent": intent, "clarification_question": clarification}


def route_after_intent(state: FinOpsAgentState) -> str:
    """A *conditional edge* function. Unlike a node, this doesn't update
    state -- it just inspects the current state and returns the name of
    the next node to visit. This is how you branch a LangGraph workflow.
    """
    return "clarify" if state["intent"] == "needs_clarification" else "retrieve_structured"


async def clarify_node(state: FinOpsAgentState) -> dict:
    """Terminal node for the ambiguous-question branch -- skips both
    retrieval steps entirely since there's nothing useful to retrieve yet.
    """
    question = state.get("clarification_question") or "Could you clarify which account or time period you mean?"
    return {"answer": question}


async def retrieve_structured_node(state: FinOpsAgentState, *, db: AsyncSession, user: User) -> dict:
    """Node 2a: the "exact SQL" half of dual retrieval. Reuses the same
    bff_helpers your REST endpoints already call, so the numbers the
    agent cites are guaranteed to match what the dashboard shows -- the
    LLM never invents or recomputes a dollar figure.
    """
    account_ids = state["account_ids"]
    spend = await bh.month_to_date_spend(db, account_ids)
    breakdown = await bh.breakdown_by_service(db, account_ids, top_n=5)

    finding_types_by_intent = {
        "waste": [FindingType.ORPHANED],
        "savings": [FindingType.ORPHANED, FindingType.UNDERUTILIZED, FindingType.NIGHT_SHUTDOWN_CANDIDATE],
        "anomaly": [FindingType.COST_ANOMALY],
    }
    finding_types = finding_types_by_intent.get(state["intent"])
    findings = await bh.open_findings(db, user.customer_id, finding_types)

    return {
        "structured_context": {
            "spend": spend,
            "breakdown": breakdown,
            "findings": [
                {
                    "title": f.title,
                    "recommendation": f.recommendation,
                    "estimated_monthly_savings_usd": float(f.estimated_monthly_savings_usd or 0),
                }
                for f in findings[:10]
            ],
        }
    }


async def retrieve_semantic_node(state: FinOpsAgentState, *, db: AsyncSession, user: User) -> dict:
    """Node 2b: the vector-search half of dual retrieval -- pulls in
    narrative context (past anomaly write-ups, recommendation text,
    policy docs) that isn't easily expressed as a SQL aggregate.
    """
    chunks = await similarity_search(db, customer_id=user.customer_id, query=state["query"])
    return {"semantic_chunks": [c.content for c in chunks]}


_GENERATION_SYSTEM_PROMPT = """You are a FinOps cost advisor. You are given:
1. Structured data (exact numbers) for this customer's cloud spend.
2. Related passages retrieved via semantic search (past findings, notes).

Answer the user's question grounded ONLY in this context. Cite dollar
figures exactly as given -- never estimate or round differently than
the source data. If the context doesn't contain enough to answer, say
so plainly rather than guessing.
"""


async def generate_recommendation_node(state: FinOpsAgentState) -> dict:
    """Node 3: synthesis. Both retrieval nodes ran (LangGraph runs them
    in the order you wire with add_edge, or in parallel if you fan them
    out from the same node -- see the note in graph.py), so by the time
    this node runs, state has both structured_context and semantic_chunks.
    """
    context_block = (
        f"Structured data:\n{json.dumps(state['structured_context'], indent=2)}\n\n"
        f"Related passages:\n" + "\n---\n".join(state.get("semantic_chunks") or ["(none found)"])
    )
    messages = [{"role": "system", "content": _GENERATION_SYSTEM_PROMPT}]
    # Same history the intent classifier saw -- so if the user's latest
    # message is "all" (answering "what would you like to know?"), the
    # model can see what "all" was actually replying to.
    messages.extend(state.get("history", [])[-6:])
    messages.append({"role": "user", "content": f"Context:\n{context_block}\n\nQuestion: {state['query']}"})

    answer = await chat_completion(messages)
    return {"answer": answer}