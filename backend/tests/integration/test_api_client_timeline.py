import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_client_timeline_endpoint():
    response = client.get("/api/clients/T27261/timeline")
    assert response.status_code == 200
    data = response.json()
    assert data["client_code"] == "T27261"
    assert "relationship_health" in data
    assert "timeline" in data
    assert "recurrent_pains" in data
