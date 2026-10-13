"""
Testes unitários abrangentes para o pipeline de atas (Ata Operacional e Ata Executiva)
e camada DPO experimental do Proton Flow.
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from analysis_service import (
    AnalysisService,
    validar_evidencias_contra_transcricao,
    aplicar_regras_deterministas_seguranca,
    is_transcript_sufficient,
    check_evidence_in_transcript,
    sanitize_template_placeholders,
    sanitize_data_recursively,
    build_executive_summary
)
from schemas import (
    ExecutiveSummarySchema,
    MeetingAnalysisResult,
    TaskSchema,
    PainSchema
)
from dpo_reranker import (
    is_dpo_enabled,
    score_text_faithfulness,
    rerank_analysis_result
)


def test_placeholder_sanitizer_removes_all_patterns():
    """Valida a remoção e neutralização de placeholders literais ([PESSOA], [EMPRESA], etc.)."""
    raw_text = "O facilitador [PESSOA] alinhou com a empresa [EMPRESA] a entrega para [DATA]."
    clean = sanitize_template_placeholders(raw_text)
    assert "[PESSOA]" not in clean
    assert "[EMPRESA]" not in clean
    assert "[DATA]" not in clean
    assert "participante citado" in clean
    assert "empresa participante" in clean

    nested_dict = {
        "tema": "Reunião com [EMPRESA]",
        "tarefas": [
            {"tarefa": "Enviar dados para [PESSOA]", "responsavel": "[PESSOA]"}
        ]
    }
    cleaned_dict = sanitize_data_recursively(nested_dict)
    assert "[EMPRESA]" not in cleaned_dict["tema"]
    assert "[PESSOA]" not in cleaned_dict["tarefas"][0]["tarefa"]
    assert "[PESSOA]" not in cleaned_dict["tarefas"][0]["responsavel"]


def test_transcript_sufficiency_gate():
    """Valida o bloqueio de transcrições curtas, vazias ou ruído de áudio."""
    # Transcrição vazia
    is_ok, reason = is_transcript_sufficient("")
    assert not is_ok

    # Transcrição muito curta (< 50 chars)
    is_ok, reason = is_transcript_sufficient("Olá bom dia a todos.")
    assert not is_ok
    assert "insuficiente" in reason.lower()

    # Teste de áudio sem deliberações
    is_ok, reason = is_transcript_sufficient("Alô alô testando 1 2 3 som ok beleza bom dia.")
    assert not is_ok
    assert "teste de áudio" in reason.lower() or "insuficiente" in reason.lower()

    # Transcrição operacional legítima
    transcricao_real = (
        "Reunião de alinhamento operacional do time de suporte. "
        "A Mariana identificou lentidão crítica na emissão de notas fiscais pelo Protheus. "
        "Carlos ficou responsável por revisar o banco de dados até sexta-feira."
    )
    is_ok, reason = is_transcript_sufficient(transcricao_real)
    assert is_ok
    assert reason == ""


def test_evidence_validation_rejects_hallucinations_and_keeps_valid():
    """Garante que tarefas com evidência factual sejam validadas e alucinações sejam descartadas."""
    transcricao = "Mariana disse que vai atualizar os parâmetros do faturamento no Protheus."

    raw = {
        "tarefas": [
            {
                "tarefa": "Atualizar parâmetros do faturamento",
                "evidence": "vai atualizar os parâmetros do faturamento",
                "confidence": 0.90
            },
            {
                "tarefa": "Comprar servidores em Tóquio",
                "evidence": "vamos importar data centers de Tóquio",
                "confidence": 0.85
            },
            {
                "tarefa": "Revisar fluxo de caixa",
                "evidence": "não localizada",
                "confidence": 0.80
            }
        ],
        "dores": []
    }

    validated = validar_evidencias_contra_transcricao(raw, transcricao)
    tarefas = validated["tarefas"]
    assert len(tarefas) == 3

    # Tarefa 1: válida
    assert tarefas[0]["task_validation_status"] == "valid"
    assert tarefas[0]["evidence_status"] == "validated"
    assert tarefas[0]["confidence"] >= 0.80

    # Tarefas 2 e 3: rejeitadas por falta de evidência
    assert tarefas[1]["task_validation_status"] == "rejected_noise"
    assert tarefas[1]["evidence_status"] == "rejected"
    assert tarefas[1]["confidence"] == 0.30

    assert tarefas[2]["task_validation_status"] == "rejected_noise"
    assert tarefas[2]["evidence_status"] == "rejected"
    assert tarefas[2]["confidence"] == 0.30

    # Quando passar por aplicar_regras_deterministas_seguranca, as rejeitadas são excluídas
    processed = aplicar_regras_deterministas_seguranca(
        raw_result=validated,
        transcricao=transcricao,
        gatilhos=[]
    )
    assert len(processed["tarefas"]) == 1
    assert processed["tarefas"][0]["tarefa"] == "Atualizar parâmetros do faturamento"
    assert processed["_items_descartados_ruido"] >= 2


def test_decision_separation_concrete_vs_discussion():
    """Verifica a separação estrita entre decisões aprovadas e temas meramente discutidos."""
    transcricao = "Ficou acordado que o módulo financeiro será homologado na próxima semana. Também comentamos sobre migrar nuvem."
    
    raw = {
        "contexto": {
            "problema": "Gargalo no módulo financeiro",
            "decisao": "Ficou acordado que o módulo financeiro será homologado"
        },
        "tarefas": [],
        "dores": []
    }
    
    validated = validar_evidencias_contra_transcricao(raw, transcricao)
    assert len(validated["decisoes_concretas"]) == 1
    assert "homologado" in validated["decisoes_concretas"][0]

    # Caso especulativo ou sem evidência conclusiva
    raw_vago = {
        "contexto": {
            "problema": "Discussão de servidores",
            "decisao": "Comentamos sobre migrar nuvem"
        },
        "tarefas": [],
        "dores": []
    }
    validated_vago = validar_evidencias_contra_transcricao(raw_vago, transcricao)
    assert len(validated_vago["decisoes_concretas"]) == 0
    assert len(validated_vago["temas_em_discussao"]) == 1


def test_dpo_reranker_disabled_by_default():
    """Garante que por padrão o DPO permanece inativo sem custo computacional."""
    with patch.dict(os.environ, {"DPO_ENABLED": "false"}):
        assert not is_dpo_enabled()
        sample = {"tema": "Alinhamento", "tarefas": [{"tarefa": "Testar", "confidence": 0.8}]}
        result = rerank_analysis_result(sample, "Transcrição de teste")
        # Deve retornar idêntico
        assert result == sample


def test_dpo_reranker_scoring_when_enabled():
    """Verifica a lógica de pontuação de fidelidade factual da camada DPO."""
    with patch.dict(os.environ, {"DPO_ENABLED": "true"}):
        assert is_dpo_enabled()
        transcript = "Carlos vai enviar o arquivo amanhã."
        
        # Frase honesta e fiel (Leitura A)
        faithful_text = "Carlos ficou responsável por enviar o arquivo, prazo não mencionado."
        score_a, signals_a = score_text_faithfulness(faithful_text, transcript)
        assert score_a >= 1.0

        # Frase especulativa com acusação punitiva (Leitura B)
        unfaithful_text = "Carlos não quer aprovar o arquivo por falta de comprometimento em 5 dias."
        score_b, signals_b = score_text_faithfulness(unfaithful_text, transcript)
        assert score_b < 0.60
        assert len(signals_b) >= 2


def test_insufficient_data_produces_executive_summary_without_hallucinations():
    """Garante que reunião insuficiente produza ata executiva transparente."""
    svc = AnalysisService()
    transcript_curta = "Reunião de teste, som 1 2 3."
    res = svc.analyze(transcript_curta)

    assert isinstance(res, MeetingAnalysisResult)
    assert res.analise_metadados.status == "insufficient_data"
    assert len(res.tarefas) == 0
    assert res.resumo_executivo is not None
    assert res.resumo_executivo.status == "insufficient_data"
    assert len(res.resumo_executivo.decisions_made) == 0
    assert "insuficiente" in res.resumo_executivo.summary_for_decision.lower()


def test_export_safety_no_llm_invocation():
    """Garante que rotas de exportação utilizem apenas dados estruturados sem invocar Ollama/LLM."""
    with patch("requests.post") as mock_post:
        # Cria uma análise válida
        explicit_data = {
            "tema": "Implantação TOTVS Protheus",
            "contexto": {
                "problema": "Divergência de saldos",
                "decisao": "Aprovada homologação"
            },
            "tarefas": [
                {
                    "tarefa": "Enviar relatório",
                    "responsavel": "Carlos",
                    "prazo": "2026-09-15",
                    "status": "Em Andamento",
                    "prioridade": "Alta",
                    "evidencia": "Carlos enviará o relatório amanhã."
                }
            ],
            "dores": []
        }
        exec_summary = build_executive_summary(explicit_data)
        # Nenhuma requisição HTTP ao Ollama deve ser disparada
        assert mock_post.call_count == 0
        parsed = ExecutiveSummarySchema(**exec_summary)
        assert parsed.version == "executive_v1"
        assert len(parsed.decisions_made) >= 1
