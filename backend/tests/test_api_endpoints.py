import pytest
import sys
import os
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import app

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.0.0"


def test_meetings_paginated_endpoint():
    res = client.get("/api/meetings?page=1&page_size=5")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "total_pages" in data
    assert len(data["items"]) <= 5


def test_analytics_quarter_endpoint():
    res = client.get("/api/analytics/quarter?year=2026&quarter=1")
    assert res.status_code == 200
    data = res.json()
    assert "period" in data
    assert "meetings" in data
    assert "top_topics" in data
    assert "recurring_pains" in data
    assert "data_quality" in data
    assert "urgency_distribution" in data


def test_analytics_drilldown_endpoint():
    res = client.get("/api/analytics/quarter/meetings?metric_type=topic&metric_key=financeiro")
    assert res.status_code == 200
    data = res.json()
    assert "metric_type" in data
    assert "items" in data


def test_totvs_systems_endpoint():
    res = client.get("/api/integracoes/sistemas")
    assert res.status_code == 200
    data = res.json()
    assert "fluig" in data
    assert "crm" in data
    assert "protheus" in data
    assert "analytics" in data
