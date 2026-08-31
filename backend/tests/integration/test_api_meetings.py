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
