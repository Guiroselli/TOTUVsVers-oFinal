import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from normalization import (
    normalize_pain_category, 
    normalize_topic_name, 
    normalize_date_iso, 
    normalize_client_code, 
    normalize_urgency,
    get_pain_metadata
)


def test_normalize_pain_category():
    # Variações e erros de digitação comuns
    assert normalize_pain_category("aprovacao_pendente") == "aprovacao_pendente"
    assert normalize_pain_category("aprovação_pendente") == "aprovacao_pendente"
    assert normalize_pain_category("Aprovação Pendente") == "aprovacao_pendente"
    assert normalize_pain_category("documentacao_faltando") == "documento_faltando"
    assert normalize_pain_category("document_faltando") == "documento_faltando"
    assert normalize_pain_category("gargalo_operacional") == "gargalo_operacional"
    assert normalize_pain_category("garagalo_operacional") == "gargalo_operacional"
    assert normalize_pain_category("sistema lento") == "gargalo_operacional"
    assert normalize_pain_category("atraso_prazo") == "atraso_prazo"
    assert normalize_pain_category("prazo em risco") == "atraso_prazo"
    assert normalize_pain_category("insatisfação do cliente") == "insatisfacao_cliente"
    assert normalize_pain_category("falta de métricas") == "falta_metricas"
    assert normalize_pain_category("equipe sobrecarregada") == "problemas_equipe"
    assert normalize_pain_category("problema no estoque") == "gestao_estoque"
    assert normalize_pain_category("outro motivo") == "outro"
    assert normalize_pain_category(None) == "outro"
    assert normalize_pain_category("") == "outro"


def test_get_pain_metadata():
    meta = get_pain_metadata("aprovação_pendente")
    assert meta["label"] == "Aprovação pendente"
    assert meta["sistema_totvs"] == "fluig"
    assert meta["cor"] == "#ef4444"


def test_normalize_topic_name():
    k1, l1 = normalize_topic_name("Financeiro")
    assert k1 == "financeiro"
    assert "Financeiro" in l1

    k2, l2 = normalize_topic_name("Faturamento e Contas")
    assert k2 == "financeiro"

    k3, l3 = normalize_topic_name("Desenvolvimento e TI")
    assert k3 == "desenvolvimento"

    k4, l4 = normalize_topic_name("Roadmap de Produto")
    assert k4 == "produto"


def test_normalize_date_iso():
    assert normalize_date_iso("2026-03-18 16:00:00") == "2026-03-18 16:00:00"
    assert normalize_date_iso("18/03/2026 16:00:00") == "2026-03-18 16:00:00"
    assert normalize_date_iso("18/03/2026") == "2026-03-18"
    assert normalize_date_iso("2026-03-18") == "2026-03-18"
    assert normalize_date_iso("2026-03-18T16:00:00Z") == "2026-03-18 16:00:00"
    assert normalize_date_iso(None) is None
    assert normalize_date_iso("Data não informada") is None
    assert normalize_date_iso("-") is None


def test_normalize_client_code():
    assert normalize_client_code("T27261") == "T27261"
    assert normalize_client_code(" T27261 ") == "T27261"
    assert normalize_client_code("Ao Vivo") == "Ao Vivo"
    assert normalize_client_code(None) == "Geral"
    assert normalize_client_code("") == "Geral"


def test_normalize_urgency():
    assert normalize_urgency("Alta") == "Alta"
    assert normalize_urgency("alta") == "Alta"
    assert normalize_urgency("Crítica") == "Crítica"
    assert normalize_urgency("critica") == "Crítica"
    assert normalize_urgency("Média") == "Média"
    assert normalize_urgency("media") == "Média"
    assert normalize_urgency("Baixa") == "Baixa"
    assert normalize_urgency("Desconhecido") == "Não Definido"
    assert normalize_urgency(None) == "Não Definido"
