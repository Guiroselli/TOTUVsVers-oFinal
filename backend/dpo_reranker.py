"""
Módulo de DPO Experimental (Direct Preference Optimization & Preference Reranker)
para o Proton Flow.

Implementa a Fase A do DPO: Reranker de Preferências e Fidelidade Factual,
baseado nos padrões validados pelo estudo com 50 situações e participantes humanos
(consenso >= 75% pela Leitura A - fiel, concisa, não especulativa e sem alucinações).

Comportamento:
- Controlado por variável de ambiente DPO_ENABLED (padrão: False).
- Se desabilitado (DPO_ENABLED=false), a execução é bypassada com custo computacional nulo.
- Se habilitado (DPO_ENABLED=true), avalia a fidelidade factual de tarefas, decisões e
  recomendações contra a transcrição, penalizando invenções e promovendo evidências verificadas.
- Auditável, determinístico e 100% reversível.
"""

import os
import re
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("dpo_reranker")

DPO_VERSION = "1.0.0-experimental"

# Padrões que caracterizam a Leitura B (rejeitada pelos avaliadores):
# 1. Prazos inventados sem respaldo na fala
HALUCINATED_DEADLINE_PATTERNS = [
    r"\bem\s+\d+\s+dias\b",
    r"\baté\s+sexta-feira\b",
    r"\baté\s+o\s+último\s+dia\s+útil\b",
    r"\baté\s+amanhã\b",
    r"\baté\s+o\s+final\s+da\s+semana\b",
]

# 2. Tom especulativo, punitivo ou acusatório
SPECULATIVE_PUNITIVE_PATTERNS = [
    r"\bnão\s+quer\s+aprovar\b",
    r"\bpor\s+falta\s+de\s+comprometimento\b",
    r"\bdeve\s+ser\s+punid[oa]\b",
    r"\bde\s+forma\s+intencional\b",
    r"\bpor\s+falha\s+da\s+equipe\b",
    r"\bfoi\s+invadida\b",
    r"\bcancelou\s+a\s+integração\b",
    r"\bdecidiu\s+não\s+responder\b",
]

# 3. Forçar compra imediata de produto sem homologação
FORCED_PURCHASE_PATTERNS = [
    r"\bdeve\s+contratar\s+uma\s+central\s+totvs\s+imediatamente\b",
    r"\bcomprar\s+imediatamente\b",
    r"\bcontratação\s+obrigatória\b",
]

# Padrões que caracterizam a Leitura A (preferida por 88%+ dos avaliadores):
# 1. Honestidade em relação ao que não foi falado
HUMBLE_FIDELITY_PATTERNS = [
    r"\bresponsável\s+e\s+prazo\s+não\s+mencionados\b",
    r"\bpessoa\s+responsável\s+e\s+o\s+prazo\s+exato\s+não\s+foram\s+informados\b",
    r"\bo\s+prazo\s+de\s+execução\s+não\s+foi\s+informado\b",
    r"\bresponsável\s+não\s+mencionado\b",
    r"\bproduto\s+específico\s+não\s+confirmado\b",
    r"\bferramenta\s+deve\s+ser\s+validada\b",
    r"\bsolução\s+a\s+validar\b",
    r"\bdecisão\s+provisória\b",
    r"\bintenção\s+de\s+resolver\b",
    r"\bcondicionad[ao]\b",
    r"\bcomo\s+avaliação\s+da\s+reunião\b",
]


def is_dpo_enabled() -> bool:
    """Verifica se a camada DPO experimental está ativada nas variáveis de ambiente."""
    val = os.getenv("DPO_ENABLED", "false").strip().lower()
    return val in ("true", "1", "yes", "on", "enabled")


def get_consensus_threshold() -> float:
    """Retorna o limiar de consenso configurado para filtros DPO (default: 0.75)."""
    try:
        return float(os.getenv("DPO_CONSENSUS_THRESHOLD", "0.75"))
    except ValueError:
        return 0.75


def score_text_faithfulness(text: str, transcript: str) -> Tuple[float, List[str]]:
    """
    Calcula uma pontuação de fidelidade factual (0.0 a 1.0+) baseada nas regras
    validadas no estudo das 50 situações de preferência humana.
    """
    if not text:
        return 0.0, ["Texto vazio"]

    score = 1.0
    signals = []
    text_lower = text.lower()
    transcript_lower = transcript.lower() if transcript else ""

    # 1. Penalização por prazo alucinado ausente da fala
    for pattern in HALUCINATED_DEADLINE_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            matched_phrase = match.group(0)
            if matched_phrase not in transcript_lower:
                score -= 0.35
                signals.append(f"Penalidade DPO: Prazo sem evidência textual ('{matched_phrase}')")

    # 2. Penalização por linguagem especulativa, punitiva ou acusatória
    for pattern in SPECULATIVE_PUNITIVE_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            matched_phrase = match.group(0)
            score -= 0.50
            signals.append(f"Penalidade DPO: Linguagem especulativa/acusatória ('{matched_phrase}')")

    # 3. Penalização por recomendação comercial forçada sem validação
    for pattern in FORCED_PURCHASE_PATTERNS:
        match = re.search(pattern, text_lower)
        if match:
            matched_phrase = match.group(0)
            score -= 0.40
            signals.append(f"Penalidade DPO: Recomendação comercial forçada ('{matched_phrase}')")

    # 4. Bônus por honestidade factual (qualificadores da Leitura A)
    for pattern in HUMBLE_FIDELITY_PATTERNS:
        if re.search(pattern, text_lower):
            score += 0.20
            signals.append("Bônus DPO: Transparência sobre campos não mencionados na transcrição")
            break

    # 5. Bônus por correspondência literal com trecho falado
    if len(text_lower) >= 15 and text_lower in transcript_lower:
        score += 0.25
        signals.append("Bônus DPO: Citação literal confirmada na transcrição")

    return max(0.0, round(score, 2)), signals


def rerank_tasks(
    tasks: List[Dict[str, Any]], 
    transcript: str
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Aplica o Reranker DPO sobre as tarefas candidatas.
    Promove itens factuais e neutraliza inferências punitivas ou prazos artificiais.
    """
    if not tasks:
        return [], {"evaluated": 0, "reranked": False}

    scored_tasks = []
    for idx, t in enumerate(tasks):
        desc = t.get("tarefa", "")
        ev = t.get("evidencia") or t.get("evidence") or ""
        score, signals = score_text_faithfulness(f"{desc} {ev}", transcript)

        # Ajuste adaptativo de confiança baseado na pontuação DPO
        orig_conf = float(t.get("confidence", 0.8))
        dpo_adjusted_conf = round(min(1.0, max(0.2, orig_conf * (score / 1.0))), 2)

        t_copy = dict(t)
        t_copy["dpo_faithfulness_score"] = score
        t_copy["dpo_signals"] = signals
        t_copy["confidence"] = dpo_adjusted_conf
        scored_tasks.append((score, idx, t_copy))

    # Ordena prioritariamente por score DPO decrescente
    scored_tasks.sort(key=lambda x: x[0], reverse=True)
    reranked_list = [item[2] for item in scored_tasks]

    avg_score = round(sum(item[0] for item in scored_tasks) / len(scored_tasks), 2)
    telemetry = {
        "evaluated_tasks": len(tasks),
        "avg_dpo_score": avg_score,
        "reranked": True
    }
    return reranked_list, telemetry


def rerank_analysis_result(
    analysis_result: Dict[str, Any], 
    transcript: str
) -> Dict[str, Any]:
    """
    Aplica a camada DPO sobre o resultado completo da análise.
    Se DPO_ENABLED estiver desligado, retorna o resultado inalterado.
    Se ligado, executa o rerank e anota analise_metadados com telemetria.
    """
    if not is_dpo_enabled():
        return analysis_result

    logger.info("Aplicando camada DPO Experimental (Fase A - Preference Reranker)...")

    # 1. Rerank de tarefas
    tarefas = analysis_result.get("tarefas", [])
    if isinstance(tarefas, list) and tarefas:
        reranked_tasks, tasks_telemetry = rerank_tasks(tarefas, transcript)
        analysis_result["tarefas"] = reranked_tasks
    else:
        tasks_telemetry = {"evaluated_tasks": 0, "reranked": False}

    # 2. Avaliação de fidelidade do tema e contexto
    tema = str(analysis_result.get("tema", ""))
    tema_score, tema_signals = score_text_faithfulness(tema, transcript)

    # 3. Anotação na metainformação
    metadados = analysis_result.setdefault("analise_metadados", {})
    if isinstance(metadados, dict):
        metadados["dpo_layer"] = {
            "enabled": True,
            "version": DPO_VERSION,
            "tasks_telemetry": tasks_telemetry,
            "tema_fidelity_score": tema_score,
            "consensus_threshold": get_consensus_threshold()
        }

    return analysis_result
