import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_quarter_analytics_endpoint():
    response = client.get("/api/analytics/quarter?start_date=2026-01-01&end_date=2026-03-31")
    assert response.status_code == 200
    data = response.json()
    assert "top_topics" in data
    assert "recurring_pains" in data
    assert "managerial_alerts" in data
    assert "open_actions" in data
    assert "clients_at_risk" in data
    assert "segments_unidentified" in data
    assert "data_quality" in data
    
    # Garante que 'Ao Vivo', 'Geral', 'SERVICOS', etc. nunca aparecem como clientes em risco
    forbidden_clients = {"Ao Vivo", "Geral", "SERVICOS", "FINANCEIRO", "LOGISTICA", "Não identificado"}
    for client_metric in data["clients_at_risk"]:
        assert client_metric["codigo_cliente"] not in forbidden_clients
        
    # Garante que segments_unidentified é sempre uma lista e tem todos os campos do contrato
    assert isinstance(data["segments_unidentified"], list)
    for seg in data["segments_unidentified"]:
        assert "segment_or_source" in seg
        assert "total_reunioes" in seg
        assert "total_dores" in seg
        assert "urgencia_maxima" in seg
        assert "acoes_pendentes" in seg
        assert "dores_principais" in seg

    # Garante que data quality possui cálculo detalhado e breakdown com pesos 50/50
    dq = data["data_quality"]
    assert "score_qualidade_dados" in dq
    assert "score_qualidade_ia" in dq
    assert "score_qualidade" in dq
    assert "calculation_breakdown" in dq
    assert dq["calculation_breakdown"]["peso_dados_geral"] == 50
    assert dq["calculation_breakdown"]["peso_ia_geral"] == 50

def test_compare_periods_endpoint():
    response = client.get("/api/analytics/compare?base_start=2026-01-01&base_end=2026-03-31&compare_start=2025-10-01&compare_end=2025-12-31")
    assert response.status_code == 200
    data = response.json()
    assert "topics_comparison" in data
    assert "new_pains" in data
    assert "resolved_pains" in data

def test_pains_lifecycle_endpoint():
    response = client.get("/api/analytics/pains/lifecycle")
    assert response.status_code == 200
    data = response.json()
    assert "total_pains_tracked" in data
    assert "items" in data

def test_drilldown_endpoint():
    response = client.get("/api/analytics/quarter/meetings?metric_type=urgency&metric_key=Crítica")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
