from typing import TypedDict


class RetrievalState(TypedDict):
    # ── Request context ───────────────────────────────────────────────────
    query_id: str                      # UUID generated at router entry; flows through for telemetry
    session_id: str
    user_id: str
    collection_id: str
    collection_name: str
    doc_id: str                        # "" for collection-wide; a doc_id scopes retrieval to one document
    raw_query: str
    is_graph: bool
    conversation_history: list[dict]   # [{query, answer}, ...] from prior turns

    # ── Agent 1: Query Rewriter ───────────────────────────────────────────
    rewritten_query: str
    query_complexity: str              # "simple" | "complex"

    # ── Agent 2: Query Planner ────────────────────────────────────────────
    # Also rewritten by Refinement agent in subsequent iterations
    planned_queries: list[str]

    # ── Agent 3: Retrieval ────────────────────────────────────────────────
    retrieved_chunks: list[dict]       # top RERANK_TOP_K per planned query, merged
    graph_context: str                 # formatted triples string — injected into LLM prompt
    graph_ui: dict                     # {"nodes": [...], "edges": [...]} — returned to frontend

    # ── Agent 4: Answer ───────────────────────────────────────────────────
    current_answer: str
    best_answer: str                   # best answer seen across all iterations
    best_score: float                  # verification score of best_answer

    # ── Agent 5: Verification ─────────────────────────────────────────────
    verification_score: float
    verification_feedback: str
    verification_passed: bool

    # ── Iteration control ─────────────────────────────────────────────────
    iteration: int                     # starts at 0, incremented by refinement node
    max_iterations: int

    # ── Final ─────────────────────────────────────────────────────────────
    final_answer: str
    citations: list[dict]
    no_context: bool                   # True when first retrieval finds nothing
    answer_found: bool                 # False when the answer is a grounded refusal — suppress citations + graph
