"""LangGraph state.

LangGraph's core idea: a graph is a set of nodes (plain functions) that
all read from and write to one shared `state` object. You define the
shape of that state once (as a TypedDict), and every node receives the
current state, returns a dict of the fields it wants to update, and
LangGraph merges that into the state before calling the next node.

Nothing here is FinOps-specific -- this is the same shape you'd use for
any "gather context, then ask an LLM" workflow.
"""
from typing import Literal, TypedDict
import uuid


Intent = Literal["waste", "forecast", "savings", "anomaly", "general", "needs_clarification"]


class FinOpsAgentState(TypedDict, total=False):
    # --- input (set once, before the graph runs) ---
    query: str
    customer_id: uuid.UUID
    account_ids: list[uuid.UUID]
    # Prior turns of this conversation, oldest first: [{"role": "user"|"assistant", "content": "..."}].
    # Without this, every call is evaluated with zero memory of what was
    # already asked/answered -- see parse_intent_node's use of it.
    history: list[dict]

    # --- populated by parse_intent_node ---
    intent: Intent
    clarification_question: str | None

    # --- populated by the two retrieval nodes ---
    structured_context: dict  # exact numbers: spend, findings, breakdown
    semantic_chunks: list[str]  # text passages pulled from pgvector

    # --- populated by generate_recommendation_node ---
    answer: str