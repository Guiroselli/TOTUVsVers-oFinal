import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_async_meeting_status_lifecycle():
    # 1. Salva nova reunião
    save_resp = client.post("/api/meetings/save", json={
        "transcript": "Discutimos a migração do módulo financeiro para o Protheus.",
        "segmento": "FINANCEIRO"
    })
    assert save_resp.status_code == 200
    mid = save_resp.json()["meeting_id"]

    # 2. Verifica status inicial
    get_resp = client.get(f"/api/meetings/{mid}")
    assert get_resp.status_code == 200
    assert get_resp.json()["STATUS_MEETING"] in ["aguardando_analise", "COMPLETED"]

    # 3. Atualiza status de metadados
    patch_resp = client.patch(f"/api/meetings/{mid}/metadata", json={
        "NIVEL_URGENCIA": "Alta",
        "RESPONSAVEL_REUNIAO": "Mariana Lima"
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "success"

    # 4. Confere metadados atualizados
    updated_resp = client.get(f"/api/meetings/{mid}")
    assert updated_resp.json()["NIVEL_URGENCIA"] == "Alta"
    assert updated_resp.json()["RESPONSAVEL_REUNIAO"] == "Mariana Lima"
