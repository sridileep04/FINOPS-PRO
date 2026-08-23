from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graph.graph import build_finops_graph
from app.models.user import User
from app.services import bff_helpers as bh


async def run_finops_query(db: AsyncSession, user: User, query: str) -> dict:
    """Entry point called by the API layer. Builds the graph for this
    request, runs it end-to-end, and returns both the final answer and
    the intermediate state -- handy for the frontend to show "what did
    the agent look at" or for you to debug while getting LangGraph working.
    """
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]

    graph = build_finops_graph(db, user)

    # `.ainvoke` runs the whole graph to completion and returns the final
    # merged state. Use `.astream(...)` instead if you want to stream
    # intermediate node outputs to the frontend as they happen.
    final_state = await graph.ainvoke(
        {
            "query": query,
            "customer_id": user.customer_id,
            "account_ids": account_ids,
        }
    )

    return {
        "reply": final_state.get("answer", "Sorry, I couldn't generate a response."),
        "intent": final_state.get("intent"),
        "structured_context": final_state.get("structured_context"),
        "semantic_chunks": final_state.get("semantic_chunks"),
    }