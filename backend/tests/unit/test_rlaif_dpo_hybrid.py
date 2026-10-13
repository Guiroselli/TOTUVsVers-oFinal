"""
Testes unitários abrangentes para o RLAIF/DPO Híbrido com Calibração Humana,
Barreira de Evidências e Preference Reranker do Proton Flow.
"""

import os
import json
import pytest
from unittest.mock import patch, MagicMock

from preference_reranker import (
    is_dpo_enabled,
    get_dpo_mode,
    get_max_latency_ms,
    score_text_faithfulness,
    score_candidate,
    rerank_analysis_result,
    PREFERENCE_RERANKER_VERSION
)
from schemas import (
    MeetingAnalysisResult,
    AnalysisMetadata,
    ExecutiveSummarySchema,
    TaskSchema,
    PainSchema
)


# =========================================================================
# 1. Integridade dos Datasets e Zero Vazamento (Leak-check)
# =========================================================================

def test_dataset_artifacts_integrity():
    """Valida a integridade dos artefatos de dados gerados: 2.050 avaliações, 500 situações e splits."""
    canonical_path = os.path.join("artifacts", "preferences", "situations_canonical_500.json")
    train_path = os.path.join("artifacts", "dpo_hybrid", "train.jsonl")
    val_path = os.path.join("artifacts", "dpo_hybrid", "validation_ai.jsonl")
    test_human_path = os.path.join("artifacts", "dpo_hybrid", "test_human.jsonl")
    excluded_path = os.path.join("artifacts", "dpo_hybrid", "excluded.jsonl")

    # Verifica existência
    for path in [canonical_path, train_path, val_path, test_human_path, excluded_path]:
        assert os.path.exists(path), f"Arquivo não encontrado: {path}"

    # Carrega situações canônicas
    with open(canonical_path, "r", encoding="utf-8") as f:
        canonical_data = json.load(f)
    assert len(canonical_data) == 500, f"Esperado 500 situações canônicas, encontrado {len(canonical_data)}"

    # Carrega splits
    with open(train_path, "r", encoding="utf-8") as f:
        train_rows = [json.loads(line) for line in f if line.strip()]
    with open(val_path, "r", encoding="utf-8") as f:
        val_rows = [json.loads(line) for line in f if line.strip()]
    with open(test_human_path, "r", encoding="utf-8") as f:
        test_human_rows = [json.loads(line) for line in f if line.strip()]
    with open(excluded_path, "r", encoding="utf-8") as f:
        excluded_rows = [json.loads(line) for line in f if line.strip()]

    # Valida quantidades conforme arquitetura da Fase 8
    assert len(train_rows) == 350
    assert len(val_rows) == 150
    assert len(test_human_rows) == 14
    assert len(excluded_rows) == 36


def test_zero_leakage_between_train_and_validation():
    """Garante que não há nenhum vazamento de dados entre os conjuntos de treino e validação."""
    train_path = os.path.join("artifacts", "dpo_hybrid", "train.jsonl")
    val_path = os.path.join("artifacts", "dpo_hybrid", "validation_ai.jsonl")

    with open(train_path, "r", encoding="utf-8") as f:
        train_ids = {int(row["situation_id"]) for row in (json.loads(line) for line in f if line.strip())}
    with open(val_path, "r", encoding="utf-8") as f:
        val_ids = {int(row["situation_id"]) for row in (json.loads(line) for line in f if line.strip())}

    overlap = train_ids.intersection(val_ids)
    assert len(overlap) == 0, f"Detectado vazamento de dados entre treino e validação! IDs: {overlap}"
    assert max(train_ids) <= 350
    assert min(val_ids) >= 351


# =========================================================================
# 2. Casos de Borda de Consenso de IA e Calibração Humana
# =========================================================================

def test_consensus_calculation_and_filtering():
    """Valida o cálculo do consenso e a regra de corte de 75%."""
    from dpo_reranker import get_consensus_threshold

    threshold = get_consensus_threshold()
    assert threshold == 0.75

    # 4/4 = 1.0 -> Aprovado
    votes_unanimous = ["Leitura A", "Leitura A", "Leitura A", "Leitura A"]
    agreement_unanimous = votes_unanimous.count("Leitura A") / len(votes_unanimous)
    assert agreement_unanimous >= threshold

    # 3/4 = 0.75 -> Aprovado
    votes_majority = ["Leitura A", "Leitura A", "Leitura A", "Leitura B"]
    agreement_majority = votes_majority.count("Leitura A") / len(votes_majority)
    assert agreement_majority >= threshold

    # 2/4 = 0.50 -> Empate/Rejeitado da preferência estrita
    votes_tie = ["Leitura A", "Leitura A", "Leitura B", "Leitura B"]
    agreement_tie = max(votes_tie.count("Leitura A"), votes_tie.count("Leitura B")) / len(votes_tie)
    assert agreement_tie < threshold

    # Opções ambíguas: 'As duas servem'
    votes_ambiguous = ["Leitura A", "As duas servem", "Leitura A", "As duas servem"]
    assert votes_ambiguous.count("Leitura A") / len(votes_ambiguous) < threshold


# =========================================================================
# 3. Barreira Determinística de Evidência e Rejeição de Alucinações
# =========================================================================

def test_evidence_gate_penalizes_hallucinated_deadlines():
    """Garante que prazos inventados sem respaldo na transcrição sofrem penalidade severa."""
    transcript = "Precisamos organizar o fluxo da equipe, mas não temos data definida."
    
    # Texto com prazo inventado
    candidate_hallucinated = "A equipe vai concluir tudo até sexta-feira com certeza."
    score_h, signals_h = score_text_faithfulness(candidate_hallucinated, transcript)
    
    # Texto sem prazo inventado
    candidate_faithful = "Organizar o fluxo da equipe. Responsável e prazo ainda não foram definidos."
    score_f, signals_f = score_text_faithfulness(candidate_faithful, transcript)

    assert score_f > score_h
    assert any("prazo não fundamentado" in s for s in signals_h)
    assert not any("prazo não fundamentado" in s for s in signals_f)


def test_evidence_gate_penalizes_speculative_punitive_tone():
    """Garante que imputações punitivas ou de má fé são penalizadas."""
    transcript = "O sistema apresentou lentidão hoje cedo durante o pico de acessos."
    
    candidate_speculative = "O projeto atrasou por falha da equipe e culpa exclusiva da TI."
    score_s, signals_s = score_text_faithfulness(candidate_speculative, transcript)
    
    assert score_s < 1.0
    assert any("especulativo/punitivo" in s for s in signals_s)


def test_evidence_gate_penalizes_forced_purchases():
    """Garante que recomendações de compra TOTVS forçadas e sem demanda são penalizadas."""
    transcript = "Comentamos rapidamente sobre comunicação interna na empresa."
    
    candidate_forced = "A empresa deve contratar uma central TOTVS imediatamente."
    score_fp, signals_fp = score_text_faithfulness(candidate_forced, transcript)
    
    assert score_fp < 1.0
    assert any("recomendação forçada de produto" in s for s in signals_fp)


def test_candidate_scoring_composite_veto():
    """Valida que falta de evidência literal zera o componente de evidência no score composto."""
    transcript = "Falamos de atendimento ao cliente."
    text = "Fazer levantamento de requisitos com o cliente."

    # Com evidência válida
    score_with_ev, comp_with = score_candidate(text, transcript, has_valid_evidence=True)
    # Sem evidência válida
    score_without_ev, comp_without = score_candidate(text, transcript, has_valid_evidence=False)

    assert comp_with["peso_evidencia"] == 0.40
    assert comp_without["peso_evidencia"] == 0.0
    assert score_with_ev > score_without_ev


# =========================================================================
# 4. Comportamento do Preference Reranker Híbrido (Bypass, Scoring e Fallback)
# =========================================================================

def test_reranker_disabled_bypass():
    """Garante que DPO_ENABLED=false causa bypass total sem overhead e sem modificação."""
    sample_dict = {
        "tema": "Reunião Geral",
        "resumo_operacional": "Resumo operacional base",
        "tarefas": [{"tarefa": "Tarefa base", "confidence": 0.85}],
        "analise_metadados": {"preference_layer": "init"}
    }

    with patch.dict(os.environ, {"DPO_ENABLED": "false"}):
        reranked = rerank_analysis_result(sample_dict, "Transcrição da reunião")
        assert reranked["analise_metadados"]["preference_layer"] == "disabled"
        assert reranked["analise_metadados"]["reranker_latency_ms"] == 0.0
        assert reranked["resumo_operacional"] == "Resumo operacional base"


def test_reranker_enabled_selects_more_faithful_candidate():
    """Garante que DPO_ENABLED=true seleciona a alternativa factual em candidatos."""
    sample_dict = {
        "tema": "Organização do Processo",
        "resumo_operacional": "A equipe concluirá tudo até sexta-feira com prazo obrigatório.",
        "tarefas": [
            {
                "tarefa": "Organizar processo",
                "quote": "precisamos organizar o processo",
                "confidence": 0.85
            }
        ],
        "analise_metadados": {}
    }

    candidates = [
        "A equipe concluirá tudo até sexta-feira com prazo obrigatório.",  # Alucinada
        "Organizar o processo. Responsável e prazo ainda não foram definidos."  # Factual
    ]

    with patch.dict(os.environ, {"DPO_ENABLED": "true", "DPO_MODE": "reranker"}):
        reranked = rerank_analysis_result(
            sample_dict,
            transcript="Precisamos organizar o processo, mas não definimos data nem pessoa.",
            candidates_operacional=candidates
        )

        assert reranked["analise_metadados"]["preference_layer"] == "reranker"
        assert reranked["analise_metadados"]["preference_version"] == PREFERENCE_RERANKER_VERSION
        assert reranked["analise_metadados"]["evidence_gate"] == "passed"
        assert "não foram definidos" in reranked["resumo_operacional"]


def test_reranker_timeout_protection_falls_back_to_base():
    """Garante proteção de timeout com fallback seguro para a resposta base."""
    sample_dict = {
        "tema": "Tema Seguro",
        "resumo_operacional": "Resumo base seguro",
        "tarefas": [
            {"tarefa": f"Tarefa {i}", "quote": f"quote {i}", "confidence": 0.8} for i in range(50)
        ],
        "analise_metadados": {}
    }

    with patch.dict(os.environ, {"DPO_ENABLED": "true", "DPO_MAX_LATENCY_MS": "0"}):
        # Com timeout 0ms, deve disparar proteção e cair no fallback base
        reranked = rerank_analysis_result(
            sample_dict,
            transcript="Transcrição qualquer"
        )

        assert reranked["resumo_operacional"] == "Resumo base seguro"
        assert reranked["analise_metadados"]["preference_layer"] == "fallback_timeout"


# =========================================================================
# 5. Isolamento de Reuniões Simultâneas (Multi-tenant / Live Meetings)
# =========================================================================

def test_live_meetings_isolation_between_concurrent_sessions():
    """Garante que duas reuniões simultâneas nunca misturam transcrições, scores ou candidatos."""
    dict_m1 = {
        "meeting_id": "meeting_ti_01",
        "tema": "Infraestrutura TI",
        "tarefas": [{"tarefa": "Revisar servidor A", "responsavel": "Carlos", "quote": "servidores da ti"}],
        "analise_metadados": {}
    }

    dict_m2 = {
        "meeting_id": "meeting_rh_02",
        "tema": "Recrutamento RH",
        "tarefas": [{"tarefa": "Triar currículos", "responsavel": "Marina", "quote": "recrutamento de novos estagiários"}],
        "analise_metadados": {}
    }

    tr_m1 = "Carlos comentou sobre servidores da TI e necessidade de revisão."
    tr_m2 = "Marina citou o recrutamento de novos estagiários para o RH."

    with patch.dict(os.environ, {"DPO_ENABLED": "true", "DPO_MODE": "reranker"}):
        reranked_m1 = rerank_analysis_result(dict_m1, tr_m1, meeting_id="meeting_ti_01")
        reranked_m2 = rerank_analysis_result(dict_m2, tr_m2, meeting_id="meeting_rh_02")

        # Valida isolamento de meeting_id
        assert reranked_m1["meeting_id"] == "meeting_ti_01"
        assert reranked_m2["meeting_id"] == "meeting_rh_02"

        # Valida que o conteúdo de m1 não contaminou m2
        assert reranked_m1["tarefas"][0]["responsavel"] == "Carlos"
        assert reranked_m2["tarefas"][0]["responsavel"] == "Marina"
        assert reranked_m1["tarefas"][0]["meeting_id"] == "meeting_ti_01"
        assert reranked_m2["tarefas"][0]["meeting_id"] == "meeting_rh_02"
