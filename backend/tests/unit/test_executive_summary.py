"""
Testes unitários abrangentes para a geração e validação da Ata Executiva (Executive Summary)
no Proton Flow v2.1.
"""

import pytest
from datetime import datetime
from typing import Dict, Any

from analysis_service import build_executive_summary, AnalysisService
from schemas import (
    ExecutiveSummarySchema,
    MeetingAnalysisResult,
    TaskSchema,
    PainSchema,
    ContextoSchema,
    TOTVSProductRecommendation
)


@pytest.fixture
def sample_analysis_result() -> Dict[str, Any]:
    return {
        "tema": "Implantação do Módulo de Faturamento e Estoque TOTVS Protheus",
        "contexto": {
            "problema": "Divergência de inventário e atraso na emissão de notas fiscais no armazém central.",
            "decisao": "Aprovada a migração dos dados de estoque para a base de homologação até sexta-feira."
        },
        "organizacao_por_temas": [
            {
                "tema": "Estoque e Inventário",
                "topicos": [
                    "Ajuste de saldo físico x contábil",
                    "Controle de lotes e validade"
                ]
            }
        ],
        "tarefas": [
            {
                "tarefa": "Enviar planilha de conciliação de saldos",
                "responsavel": "Carlos Silva",
                "prazo": "2026-09-12",
                "status": "Em Andamento",
                "prioridade": "Alta",
                "evidencia": "Carlos enviará a planilha de saldos até amanhã.",
                "task_validation_status": "valid"
            },
            {
                "tarefa": "Validar integração de emissão de NF-e",
                "responsavel": "Mariana Souza",
                "prazo": "2026-09-15",
                "status": "Não Inicializado",
                "prioridade": "Crítica",
                "evidencia": "Mariana precisa validar a integração de NF-e no Protheus.",
                "task_validation_status": "valid"
            },
            {
                "tarefa": "Ajustar parâmetro de cálculo de frete",
                "responsavel": "Não identificado",
                "prazo": "Não mencionado",
                "status": "Não Inicializado",
                "prioridade": "Média",
                "evidencia": "Precisamos ver quem ajusta o parâmetro de frete.",
                "task_validation_status": "pending_review"
            }
        ],
        "dores": [
            {
                "categoria": "gargalo_operacional",
                "label": "Gargalo Operacional",
                "severidade": "Crítica",
                "trecho": "Sistema trava constantemente durante a conferência de entrada.",
                "descricao": "Sistema trava constantemente durante a conferência de entrada."
            },
            {
                "categoria": "atraso_prazo",
                "label": "Atraso no Cronograma",
                "severidade": "Alta",
                "trecho": "Estamos com atraso de duas semanas na validação contábil.",
                "descricao": "Estamos com atraso de duas semanas na validação contábil."
            }
        ],
        "responsavel_reuniao": "Carlos Silva",
        "nivel_urgencia": "Alta",
        "justificativa_urgencia": "Múltiplos bloqueios operacionais com impacto direto na expedição.",
        "recomendacoes_totvs": [
            {
                "product_key": "protheus_wms",
                "product_name": "TOTVS WMS Protheus",
                "fit_score": 0.92,
                "why_recommended": "Automatização e conferência em tempo real para eliminar divergências de estoque.",
                "benefits": ["Acuracidade de 99%", "Rastreabilidade de lotes"],
                "review_status": "pending"
            }
        ],
        "analise_metadados": {
            "analysis_engine": "ollama_llama3",
            "model_name": "llama3:latest",
            "prompt_version": "2.1.0",
            "semantic_confidence": "Alta (85%)"
        }
    }


def test_build_executive_summary_complete_structure(sample_analysis_result):
    """Verifica se todos os campos obrigatórios da Ata Executiva são gerados com tipagem correta."""
    exec_summary = build_executive_summary(
        sample_analysis_result,
        meeting_metadata={"client_name": "Logística Brasil S/A", "meeting_date": "2026-09-09"},
        use_llm=False
    )

    # Validação via Pydantic Schema
    parsed = ExecutiveSummarySchema(**exec_summary)
    assert parsed.version == "executive_v1"
    assert parsed.status in ["analise_concluida", "pendente_revisao", "pronto", "generated"]
    assert "Faturamento" in parsed.summary_for_decision or "Estoque" in parsed.summary_for_decision or "Protheus" in parsed.summary_for_decision
    assert len(parsed.current_situation) > 10
    assert len(parsed.business_impact) > 10
    assert len(parsed.main_risks) >= 2
    assert len(parsed.decisions_made) >= 1
    assert len(parsed.strategic_next_steps) >= 1
    assert parsed.executive_recommendation is not None
    assert parsed.executive_recommendation.product_name == "TOTVS WMS Protheus"
    assert parsed.urgency == "Alta"


def test_decisions_made_vs_decisions_required_separation(sample_analysis_result):
    """Garante a separação estrita entre decisões já tomadas e decisões pendentes de liderança."""
    exec_summary = build_executive_summary(sample_analysis_result, use_llm=False)
    
    decisions_made = exec_summary.get("decisions_made", [])
    decisions_required = exec_summary.get("decisions_required", [])

    # Decisão registrada no contexto deve estar em decisions_made
    assert any("migração" in d["text"].lower() or "aprovada" in d["text"].lower() for d in decisions_made)

    # Tarefas pendentes de revisão ou recomendações TOTVS pendentes devem estar em decisions_required
    assert len(decisions_required) >= 1
    owner_levels = [dr.get("owner_level") for dr in decisions_required]
    assert any("Liderança" in ol for ol in owner_levels)


def test_zero_hallucination_on_empty_decisions():
    """Se não houver decisões tomadas, não deve inventar decisões falsas."""
    empty_decision_analysis = {
        "tema": "Apenas Alinhamento Preliminar",
        "contexto": {
            "problema": "Dúvidas gerais",
            "decisao": ""  # Sem decisão formal
        },
        "tarefas": [],
        "dores": [],
        "analise_metadados": {"analysis_engine": "deterministic_fallback"}
    }

    exec_summary = build_executive_summary(empty_decision_analysis, use_llm=False)
    assert exec_summary["decisions_made"] == []


def test_main_risks_sorted_by_severity(sample_analysis_result):
    """Verifica se os riscos principais são ordenados com severidade Crítica/Alta no topo."""
    exec_summary = build_executive_summary(sample_analysis_result, use_llm=False)
    risks = exec_summary.get("main_risks", [])

    assert len(risks) >= 2
    # Primeiro risco deve ser Crítico
    assert risks[0]["severity"] == "Crítica"
    assert "trava" in risks[0]["text"].lower() or "gargalo" in risks[0]["text"].lower()
    assert risks[0]["source_refs"] == ["pain:0"]


def test_strategic_next_steps_capped_at_three():
    """Garante que a Ata Executiva sintetize no máximo 3 passos estratégicos prioritários."""
    many_tasks_analysis = {
        "tema": "Revisão Geral de Projetos",
        "tarefas": [
            {"tarefa": f"Tarefa operacional número {i}", "responsavel": f"Pessoa {i}", "prioridade": "Alta" if i < 3 else "Baixa", "task_validation_status": "valid"}
            for i in range(10)
        ],
        "analise_metadados": {"analysis_engine": "ollama_llama3"}
    }

    exec_summary = build_executive_summary(many_tasks_analysis, use_llm=False)
    next_steps = exec_summary.get("strategic_next_steps", [])
    
    assert len(next_steps) <= 3


def test_fallback_contingency_executive_summary():
    """Verifica geração consistente de Ata Executiva no modo determinístico de contingência."""
    fallback_analysis = {
        "tema": "Não identificado",
        "contexto": None,
        "tarefas": [
            {"tarefa": "Realizar backup da base", "responsavel": "Lucas", "prazo": "hoje", "prioridade": "Média", "task_validation_status": "pending_review"}
        ],
        "dores": [],
        "analise_metadados": {
            "analysis_engine": "deterministic_fallback",
            "analysis_status": "fallback_deterministico"
        }
    }

    exec_summary = build_executive_summary(fallback_analysis, use_llm=False)
    
    assert exec_summary["generation_method"] in ["deterministic_executive_template", "fallback_generated"]
    assert exec_summary["review_status"] == "pending_review"
    assert len(exec_summary["missing_information"]) > 0


def test_service_method_integration():
    """Verifica se a instância de AnalysisService expõe build_executive_summary corretamente."""
    service = AnalysisService()
    analysis_data = {
        "tema": "Alinhamento TI",
        "contexto": {"problema": "Servidor lento", "decisao": "Reiniciar às 22h"},
        "tarefas": [],
        "dores": []
    }
    
    res = service.build_executive_summary(analysis_data)
    assert isinstance(res, dict)
    assert "summary_for_decision" in res
    assert "main_risks" in res
    assert "decisions_made" in res
