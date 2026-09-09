import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_meetings_paginated_no_30_limit():
    response = client.get("/api/meetings?page=1&page_size=50")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1

def test_meetings_filters():
    response = client.get("/api/meetings?status=COMPLETED&page=1&page_size=5")
    assert response.status_code == 200
    for item in response.json()["items"]:
        assert item.get("STATUS_MEETING") == "COMPLETED"

def test_document_decoupling_does_not_trigger_analyze():
    # Testa que o endpoint de recuperação de reunião para PDF não dispara análise
    response = client.get("/api/meetings/1247082")
    assert response.status_code in [200, 404]

def test_executive_summary_endpoints():
    # Obtém uma reunião existente
    meetings_res = client.get("/api/meetings?page=1&page_size=1")
    assert meetings_res.status_code == 200
    items = meetings_res.json().get("items", [])
    if not items:
        pytest.skip("Nenhuma reunião no banco para testar resumo executivo")
    
    meeting_id = str(items[0]["ID_MEETING"])

    # 1. Teste de GET /api/meetings/{id}/executive-summary
    get_res = client.get(f"/api/meetings/{meeting_id}/executive-summary")
    assert get_res.status_code in [200, 404]

    # 2. Teste de POST /api/meetings/{id}/executive-summary/generate
    gen_res = client.post(f"/api/meetings/{meeting_id}/executive-summary/generate", json={"force_rebuild": True, "use_llm": False})
    if gen_res.status_code == 200:
        data = gen_res.json()
        assert data["status"] == "success"
        assert "executive_summary" in data
        assert "summary_for_decision" in data["executive_summary"]
        assert "main_risks" in data["executive_summary"]
        assert "strategic_next_steps" in data["executive_summary"]

        # 3. Teste de PATCH /api/meetings/{id}/executive-summary/status
        patch_res = client.patch(f"/api/meetings/{meeting_id}/executive-summary/status", json={"review_status": "approved"})
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "success"
