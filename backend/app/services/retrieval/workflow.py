"""
Retrieval pipeline orchestrator.

Instantiates all 7 agents, builds the LangGraph StateGraph, compiles it once
at server startup. The router imports `workflow_app` and `run_pipeline`.

Graph flow:
  START
    → query_rewriter
    → query_planner
    → retrieval
    → [route_after_retrieval]
        "no_context" → no_context_node → END
        "answer"     → answer → verification → [route_after_verification]
                                    "citation"   → citation → END
                                    "refinement" → refinement → retrieval  (loop)
"""
from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from app.services.retrieval.state import RetrievalState
from app.services.retrieval.config import MAX_ITERATIONS, VERIFY_PASS_COMPLEX_FALLBACK

from app.services.retrieval.prompts.prompt_loader import load_prompt_config
from app.services.retrieval.agents.query_rewriter  import QueryRewriterAgent
from app.services.retrieval.agents.query_planner   import QueryPlannerAgent
from app.services.retrieval.agents.retrieval_agent import RetrievalAgent
from app.services.retrieval.agents.answer_agent    import AnswerAgent
from app.services.retrieval.agents.verification_agent import VerificationAgent
from app.services.retrieval.agents.refinement_agent  import RefinementAgent
from app.services.retrieval.agents.citation_agent    import CitationAgent


# ── Instantiate agents at module load (once per server lifetime) ──────────────

_query_rewriter  = QueryRewriterAgent(load_prompt_config("query_rewriter"))
_query_planner   = QueryPlannerAgent(load_prompt_config("query_planner"))
_retrieval_agent = RetrievalAgent(load_prompt_config("retrieval_agent"))
_answer_agent    = AnswerAgent(load_prompt_config("answer_agent"))
_verification    = VerificationAgent(load_prompt_config("verification_agent"))
_refinement      = RefinementAgent(load_prompt_config("refinement_agent"))
_citation        = CitationAgent(load_prompt_config("citation_agent"))


# ── Special nodes ─────────────────────────────────────────────────────────────

async def _no_context_node(state: RetrievalState) -> dict:
    """Reached when retrieval finds no chunks and graph is empty."""
    from langgraph.config import get_stream_writer
    try:
        writer = get_stream_writer()
        writer({"agent": "no_context", "event": "done", "status": "No relevant context found."})
    except Exception:
        pass
    return {
        "final_answer": (
            "I could not find relevant information in the knowledge base to answer your question. "
            "Please check that the collection contains documents related to your query."
        ),
        "citations":    [],
        "no_context":   True,
        "answer_found": False,
    }


# ── Routing functions ─────────────────────────────────────────────────────────

def _route_after_retrieval(state: RetrievalState) -> str:
    """After first retrieval: go to no_context or answer."""
    # Only bail out on first iteration — if refinement brought no results,
    # we still run answer with previous context.
    if state.get("no_context") and state.get("iteration", 0) == 0:
        return "no_context"
    return "answer"


def _route_after_verification(state: RetrievalState) -> str:
    """Decide whether to iterate (refinement) or finalize (citation)."""
    passed     = state.get("verification_passed", False)
    iteration  = state.get("iteration", 0)
    max_iters  = state.get("max_iterations", MAX_ITERATIONS)
    complexity = state.get("query_complexity", "simple")

    # Always stop when we've hit the iteration limit
    if iteration >= max_iters:
        return "citation"

    # Simple query: stop as soon as it passes
    if complexity == "simple" and passed:
        return "citation"

    # Complex query: early exit on high score
    if complexity == "complex" and passed:
        return "citation"

    # Not passed and still have iterations left
    return "refinement"


# ── Build the StateGraph ──────────────────────────────────────────────────────

_graph = StateGraph(RetrievalState)

_graph.add_node("query_rewriter", _query_rewriter.node)
_graph.add_node("query_planner",  _query_planner.node)
_graph.add_node("retrieval",      _retrieval_agent.node)
_graph.add_node("no_context",     _no_context_node)
_graph.add_node("answer",         _answer_agent.node)
_graph.add_node("verification",   _verification.node)
_graph.add_node("refinement",     _refinement.node)
_graph.add_node("citation",       _citation.node)

_graph.add_edge(START,            "query_rewriter")
_graph.add_edge("query_rewriter", "query_planner")
_graph.add_edge("query_planner",  "retrieval")

_graph.add_conditional_edges(
    "retrieval",
    _route_after_retrieval,
    {"no_context": "no_context", "answer": "answer"},
)

_graph.add_edge("no_context", END)
_graph.add_edge("answer",     "verification")

_graph.add_conditional_edges(
    "verification",
    _route_after_verification,
    {"citation": "citation", "refinement": "refinement"},
)

_graph.add_edge("refinement", "retrieval")
_graph.add_edge("citation",   END)

# ── Compile once ──────────────────────────────────────────────────────────────

workflow_app = _graph.compile()


# ── Public entry point used by the router ─────────────────────────────────────

async def run_pipeline(
    raw_query: str,
    collection_name: str,
    session_id: str,
    user_id: str,
    is_graph: bool,
    conversation_history: list[dict],
) -> dict:
    """
    Execute the full retrieval pipeline (non-streaming).
    Returns the final state with final_answer, citations, etc.
    """
    initial_state: RetrievalState = {
        "query_id":              "",
        "session_id":            session_id,
        "user_id":               user_id,
        "collection_id":         "",
        "collection_name":       collection_name,
        "doc_id":                "",
        "raw_query":             raw_query,
        "is_graph":              is_graph,
        "conversation_history":  conversation_history,
        "rewritten_query":       "",
        "query_complexity":      "simple",
        "planned_queries":       [],
        "retrieved_chunks":      [],
        "graph_context":         "",
        "graph_ui":              {},
        "current_answer":        "",
        "best_answer":           "",
        "best_score":            0.0,
        "verification_score":    0.0,
        "verification_feedback": "",
        "verification_passed":   False,
        "iteration":             0,
        "max_iterations":        MAX_ITERATIONS,
        "final_answer":          "",
        "citations":             [],
        "no_context":            False,
        "answer_found":          True,
    }
    result = await workflow_app.ainvoke(initial_state)
    return result
