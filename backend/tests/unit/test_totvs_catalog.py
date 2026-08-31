import pytest
from totvs_catalog import compute_recommendations, CATALOGO_TOTVS, SEGMENT_MAP

def test_explicit_segment_mapping_no_false_positives():
    # Se o segmento for desconhecido (ex: T12345), não deve presumir compatibilidade
    recs = compute_recommendations(
        dores=[],
        tarefas=[],
        tema="Alinhamento",
        client_code="T12345",
        segmento=""
    )
    # Sem dores nem tarefas nem segmento conhecido, não deve retornar recomendações fortes
    for r in recs:
        assert r["fit_score"] < 0.35
        assert r["score_breakdown"]["segment_fit"] == 0.0

def test_strong_vs_generic_keywords_separation():
    # Palavras genéricas como 'sistema' ou 'cliente' sozinhas NÃO disparam fit alto
    recs = compute_recommendations(
        dores=[],
        tarefas=[{"tarefa": "Revisar o sistema com o cliente na reunião"}],
        tema="Reunião de rotina"
    )
    for r in recs:
        assert r["is_strong_recommendation"] is False
        assert r["confidence"] < 0.50

def test_negation_handling():
    # Negação explícita como "não temos problema de estoque" não deve disparar recomendação de supply
    recs = compute_recommendations(
        dores=[{"categoria": "gestao_estoque", "descricao": "Não temos problema de estoque no armazém", "trecho": "Não temos problema de estoque"}],
        tarefas=[]
    )
    supply_rec = next((r for r in recs if r["product_key"] == "supply"), None)
    if supply_rec:
        assert len(supply_rec["negated_signals"]) > 0
        assert supply_rec["fit_score"] < 0.30

def test_5_factor_fit_score_breakdown():
    recs = compute_recommendations(
        dores=[{"categoria": "aprovacao_pendente", "label": "Aprovação Pendente", "trecho": "Aguardando aprovação de contrato"}],
        tarefas=[{"tarefa": "Criar fluxo de aprovação de alçada", "responsavel": "Ana", "prazo": "amanhã"}],
        urgencia="Alta",
        segmento="SERVICOS"
    )
    fluig_rec = next(r for r in recs if r["product_key"] == "fluig")
    assert fluig_rec["fit_score"] >= 0.50
    sb = fluig_rec["score_breakdown"]
    assert "pain_coverage" in sb
    assert "task_fit" in sb
    assert "urgency_weight" in sb
    assert "segment_fit" in sb
    assert "integration_availability" in sb

def test_insufficient_evidence_label():
    recs = compute_recommendations(
        dores=[],
        tarefas=[],
        tema="Geral"
    )
    for r in recs:
        if r["confidence"] < 0.45:
            assert r["confidence_label"] == "Evidência insuficiente para recomendar com segurança"
