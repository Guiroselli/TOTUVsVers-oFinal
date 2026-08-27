import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from analysis_service import (
    AnalysisService, 
    detectar_gatilhos, 
    aplicar_regras_deterministas_seguranca,
    TERMOS_URGENCIA_ALTA
)
from schemas import MeetingAnalysisResult


def test_detectar_gatilhos():
    transcricao = "Precisamos saber quem aprova isso. O sistema está muito lento e estamos com atraso na entrega."
    gatilhos = detectar_gatilhos(transcricao)
    categorias = [g["categoria"] for g in gatilhos]
    assert "aprovacao_pendente" in categorias or "gargalo_operacional" in categorias or "atraso_prazo" in categorias
    assert len(gatilhos) >= 2


def test_regra_urgencia_elevacao_deterministica():
    # Caso 1: Produção parada -> Crítica
    raw_1 = {
        "tema": "Incidente",
        "nivel_urgencia": "Baixa",
        "tarefas": [],
        "dores": []
    }
    res_1 = aplicar_regras_deterministas_seguranca(raw_1, "Atenção: a produção parada é crítica hoje.", [])
    assert res_1["nivel_urgencia"] == "Crítica"
    assert res_1["confianca_urgencia"] >= 0.90

    # Caso 2: Termo bloqueado / prazo vencido -> Alta
    raw_2 = {
        "tema": "Acompanhamento",
        "nivel_urgencia": "Baixa",
        "tarefas": [],
        "dores": []
    }
    res_2 = aplicar_regras_deterministas_seguranca(raw_2, "O desenvolvimento está bloqueado pelo financeiro.", [])
    assert res_2["nivel_urgencia"] == "Alta"


def test_regra_responsavel_nao_identificado():
    raw = {
        "tema": "Geral",
        "responsavel_reuniao": "Inventado Silva",
        "tarefas": [],
        "dores": []
    }
    # "Inventado Silva" não existe na transcrição
    res = aplicar_regras_deterministas_seguranca(raw, "Reunião de teste sem citar nenhum nome de facilitador.", [])
    assert res["responsavel_reuniao"] == "Não identificado"
    assert res["field_suggestions"]["responsavel_reuniao"]["confidence"] == 0.0


def test_regra_prazos_nao_mencionados():
    raw = {
        "tema": "Planejamento",
        "tarefas": [
            {"responsavel": "Carlos", "tarefa": "Revisar planilha", "prazo": ""}
        ],
        "dores": []
    }
    res = aplicar_regras_deterministas_seguranca(raw, "Carlos vai revisar a planilha depois.", [])
    assert res["tarefas"][0]["prazo"] == "Não mencionado"
    assert res["tarefas"][0]["prazo_iso"] is None


def test_fallback_ollama_indisponivel():
    # Testa comportamento determinístico quando o Ollama está inacessível
    service = AnalysisService(ollama_url="http://localhost:9999/invalid", timeout_seconds=1)
    transcricao = "Estamos com prazo vencido e o cliente não ficou satisfeito. Precisamos de aprovação."
    result = service.analyze(transcricao)
    
    assert isinstance(result, MeetingAnalysisResult)
    assert result.analise_metadados.status in ["ollama_offline", "json_decode_error"]
    assert len(result.dores) >= 1
    assert result.nivel_urgencia in ["Alta", "Crítica"]
    assert "responsavel_reuniao" in result.field_suggestions
