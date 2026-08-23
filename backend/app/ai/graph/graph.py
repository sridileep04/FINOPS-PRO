"""Wires the nodes in graph/nodes.py into an actual LangGraph StateGraph.

    parse_intent
         |
         v
    route_after_intent  (conditional edge -- not a node, just a branch)
       /          \\
  clarify      retrieve_structured
     |               |
    END       retrieve_semantic
                      |
              generate_recommendation
                      |
                     END

This is intentionally a straight-line pipeline plus one branch, since
that's the clearest starting shape to learn LangGraph from. Natural
next steps once this feels familiar:
  - Fan `retrieve_structured` and `retrieve_semantic` out from the same
    predecessor (two edges from one node) instead of chaining them, so
    LangGraph runs them concurrently -- they don't depend on each other.
  - Add a checkpointer (e.g. `langgraph.checkpoint.postgres.AsyncPostgresSaver`,
    pointed at this same Postgres database) so multi-turn conversations
    persist graph state between requests instead of starting fresh every call.
  - Add a loop: after generate_recommendation, a "critique" node that
    routes back to retrieve_semantic if the answer says the context was
    insufficient.
"""
from functools import partial

from langgraph.graph import END, StateGraph
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graph.nodes import (
    clarify_node,
    generate_recommendation_node,
    parse_intent_node,
    retrieve_semantic_node,
    retrieve_structured_node,
    route_after_intent,
)
from app.ai.graph.state import FinOpsAgentState
from app.models.user import User


def build_finops_graph(db: AsyncSession, user: User):
    """Builds and compiles the graph for one request. Rebuilding per-request
    (cheap -- it's just wiring functions together) is what lets us bind this
    request's `db` session and `user` into the retrieval nodes via
    functools.partial, while keeping every node function's signature as the
    plain `(state) -> dict` shape LangGraph expects.
    """
    graph = StateGraph(FinOpsAgentState)

    graph.add_node("parse_intent", parse_intent_node)
    graph.add_node("clarify", clarify_node)
    graph.add_node("retrieve_structured", partial(retrieve_structured_node, db=db, user=user))
    graph.add_node("retrieve_semantic", partial(retrieve_semantic_node, db=db, user=user))
    graph.add_node("generate_recommendation", generate_recommendation_node)

    graph.set_entry_point("parse_intent")

    # Conditional edge: after parse_intent, call route_after_intent(state)
    # and go to whichever of these two node names it returns.
    graph.add_conditional_edges(
        "parse_intent",
        route_after_intent,
        {"clarify": "clarify", "retrieve_structured": "retrieve_structured"},
    )

    graph.add_edge("clarify", END)
    graph.add_edge("retrieve_structured", "retrieve_semantic")
    graph.add_edge("retrieve_semantic", "generate_recommendation")
    graph.add_edge("generate_recommendation", END)

    return graph.compile()