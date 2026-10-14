import io
import pytest
from fastapi.testclient import TestClient
from main import app
from repositories import MeetingRepository

client = TestClient(app)


def test_import_preview_endpoint():
    content = b"00:00:01.000 --> 00:00:04.000\n[Marcos]: Discutimos os prazos do projeto no Teams."
    files = [
        ("files", ("teams_meeting.vtt", io.BytesIO(content), "text/vtt"))
    ]
    response = client.post("/api/meetings/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["total_processed"] == 1
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["file_name"] == "teams_meeting.vtt"
    assert item["file_type"] == ".vtt"
    assert "Discutimos os prazos do projeto no Teams." in item["transcript_normalized"]
    assert "[Marcos]:" in item["transcript_normalized"]
    assert item["content_hash"] is not None


def test_import_preview_unsupported_file():
    content = b"%PDF-1.4 binary content"
    files = [
        ("files", ("relatorio.pdf", io.BytesIO(content), "application/pdf"))
    ]
    response = client.post("/api/meetings/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert len(data["errors"]) == 1
    assert "PDF" in data["errors"][0]["error"] or "não suportada" in data["errors"][0]["error"]


def test_import_confirm_and_duplicate_handling(tmp_path, monkeypatch):
    # Isola o repositório em arquivo temporário (NUNCA toca no dataset_limpo.json original)
    temp_dataset = tmp_path / "temp_dataset.json"
    temp_dataset.write_text("[]", encoding="utf-8")
    test_repo = MeetingRepository(dataset_path=str(temp_dataset))
    monkeypatch.setattr("routers.meetings.repo", test_repo)

    unique_text = "Esta e uma transcricao unica de teste para importacao controlada."
    payload = [{
        "content_hash": "testhash12345",
        "title": "Reuniao Importada Teste",
        "date": "2026-10-14",
        "department": "Operacoes",
        "participants": ["Lucas", "Mariana"],
        "transcript_raw": unique_text,
        "transcript_normalized": unique_text,
        "allow_duplicate": False,
        "original_file_name": "teste.txt"
    }]

    # Primeiro envio: deve importar com sucesso
    res = client.post("/api/meetings/import/confirm", json={"items": payload})
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["success"] is True
    assert res_data["imported_count"] == 1
    created_id = res_data["imported_ids"][0]
    assert created_id is not None

    # Verifica se a reunião foi gravada com status correto
    meeting = test_repo.get_meeting_by_id(created_id)
    assert meeting is not None
    assert meeting["TITULO_REUNIAO"] == "Reuniao Importada Teste"
    assert meeting["STATUS_MEETING"] == "concluida"
    assert meeting["STATUS_ANALISE"] == "aguardando_analise"
    assert meeting["ORIGEM"] == "importada"
    assert meeting["ANON_TRANSCRICAO"] == unique_text

    # Segundo envio: duplicado com allow_duplicate=False deve ser rejeitado sem sobrescrever
    res2 = client.post("/api/meetings/import/confirm", json={"items": payload})
    assert res2.status_code == 200
    res2_data = res2.json()
    assert res2_data["imported_count"] == 0
    assert len(res2_data["errors"]) == 1
    assert "duplicado" in res2_data["errors"][0]["error"].lower()

    # Terceiro envio: com allow_duplicate=True deve criar um novo registro independente
    payload[0]["allow_duplicate"] = True
    payload[0]["title"] = "Reuniao Importada Teste Cópia"
    res3 = client.post("/api/meetings/import/confirm", json={"items": payload})
    assert res3.status_code == 200
    res3_data = res3.json()
    assert res3_data["imported_count"] == 1
    copy_id = res3_data["imported_ids"][0]
    assert copy_id != created_id
