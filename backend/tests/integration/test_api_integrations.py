import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_listar_sistemas_totvs():
    response = client.get("/api/integracoes/sistemas")
    assert response.status_code == 200
    data = response.json()
    assert "fluig" in data
    assert "crm" in data
    assert "protheus" in data
    assert "analytics" in data
    assert "rh" in data
    assert "supply" in data

def test_salvar_config_integracao():
    response = client.post("/api/integracoes/config", json={
        "sistema": "fluig",
        "webhook_url": "https://webhook.site/teste-fluig"
    })
    assert response.status_code == 200
    assert response.json()["status"] == "success"

def test_enviar_integracao_simulada_mensagem_obrigatoria():
    # Cria uma reunião para envio
    save_resp = client.post("/api/meetings/save", json={
        "transcript": "Discutimos fluxos de aprovação de alçadas.",
        "segmento": "SERVICOS"
    })
    mid = save_resp.json()["meeting_id"]

    resp = client.post("/api/integracoes/enviar", json={
        "sistema": "fluig",
        "meeting_id": mid,
        "tarefas": [{"tarefa": "Aprovar alçadas", "responsavel": "Ana"}],
        "modo_simulado": True
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "Simulação local — nenhuma informação foi enviada à TOTVS." in data["mensagem_usuario"]
    assert data["simulado"] is True
    assert "request_hash" in data
