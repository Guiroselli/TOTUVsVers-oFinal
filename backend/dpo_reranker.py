"""
Módulo de DPO Experimental e Preference Reranker Híbrido para o Proton Flow.
Delega para o módulo preference_reranker.py mantendo 100% de compatibilidade retroativa.
"""

from preference_reranker import (
    is_dpo_enabled,
    get_dpo_mode,
    get_max_latency_ms,
    score_text_faithfulness,
    score_candidate,
    rerank_analysis_result,
    HALUCINATED_DEADLINE_PATTERNS,
    SPECULATIVE_PUNITIVE_PATTERNS,
    FORCED_PURCHASE_PATTERNS,
    GENERIC_FILLER_PATTERNS,
    HUMBLE_FIDELITY_PATTERNS,
    PREFERENCE_RERANKER_VERSION
)

DPO_VERSION = PREFERENCE_RERANKER_VERSION

def get_consensus_threshold() -> float:
    """Retorna o limiar de consenso configurado para filtros DPO (default: 0.75)."""
    import os
    try:
        return float(os.getenv("DPO_MIN_AI_AGREEMENT", os.getenv("DPO_CONSENSUS_THRESHOLD", "0.75")))
    except ValueError:
        return 0.75
