import pytest
import uuid
from fastapi.testclient import TestClient
from main import app
from repositories import MeetingRepository


client = TestClient(app)


def test_add_and_get_chat_message():
    repo = MeetingRepository()
    m = repo.create_live_meeting({
        "titulo": "Reunião de Alinhamento Chat",
        "departamento": "TI",
        "data": "2026-10-14",
        "horario": "11:00",
        "iniciar_agora": True
    })
    mid = m["ID_MEETING"]

    # Adiciona primeira mensagem
    msg1 = repo.add_chat_message(
        meeting_id=mid,
        author="Alice",
        text="Olá equipe, bom dia a todos!",
        client_message_id="cid-1"
    )
    assert msg1["id"].startswith("msg_")
    assert msg1["meeting_id"] == mid
    assert msg1["author"] == "Alice"
    assert msg1["text"] == "Olá equipe, bom dia a todos!"
    assert msg1["client_message_id"] == "cid-1"
    assert "timestamp" in msg1

    # Adiciona segunda mensagem
    msg2 = repo.add_chat_message(
        meeting_id=mid,
        author="Bob",
        text="Bom dia Alice, conexão estável.",
        client_message_id="cid-2"
    )
    assert msg2["author"] == "Bob"

    # Recupera mensagens
    all_msgs = repo.get_chat_messages(mid)
    assert len(all_msgs) == 2
    assert all_msgs[0]["text"] == "Olá equipe, bom dia a todos!"
    assert all_msgs[1]["text"] == "Bom dia Alice, conexão estável."


def test_chat_isolation_between_meetings():
    repo = MeetingRepository()
    # Duas reuniões simultâneas (RH e TI)
    m_rh = repo.create_live_meeting({
        "titulo": "Reunião RH Geral",
        "departamento": "RH",
        "data": "2026-10-14",
        "horario": "14:00",
        "iniciar_agora": True
    })
    m_ti = repo.create_live_meeting({
        "titulo": "Reunião TI Geral",
        "departamento": "TI",
        "data": "2026-10-14",
        "horario": "14:00",
        "iniciar_agora": True
    })

    repo.add_chat_message(m_rh["ID_MEETING"], "Carol", "Pauta de contratações aprovada.")
    repo.add_chat_message(m_ti["ID_MEETING"], "Dave", "Deploy de infraestrutura agendado.")

    rh_msgs = repo.get_chat_messages(m_rh["ID_MEETING"])
    ti_msgs = repo.get_chat_messages(m_ti["ID_MEETING"])

    assert len(rh_msgs) == 1
    assert rh_msgs[0]["text"] == "Pauta de contratações aprovada."
    assert len(ti_msgs) == 1
    assert ti_msgs[0]["text"] == "Deploy de infraestrutura agendado."

    # Verifica que nenhuma mensagem vazou para a outra reunião
    assert not any("Deploy" in m["text"] for m in rh_msgs)
    assert not any("contratações" in m["text"] for m in ti_msgs)


def test_chat_idempotency_via_client_message_id():
    repo = MeetingRepository()
    m = repo.create_live_meeting({
        "titulo": "Reunião Idempotência Chat",
        "departamento": "Operações",
        "data": "2026-10-14",
        "horario": "15:00",
        "iniciar_agora": True
    })
    mid = m["ID_MEETING"]

    cid = f"client-id-{uuid.uuid4().hex[:8]}"
    msg_first = repo.add_chat_message(mid, "User 1", "Mensagem enviada com retry de rede", client_message_id=cid)
    msg_retry = repo.add_chat_message(mid, "User 1", "Mensagem enviada com retry de rede", client_message_id=cid)

    # Devem ter o mesmo ID e a lista deve conter apenas uma mensagem
    assert msg_first["id"] == msg_retry["id"]
    msgs = repo.get_chat_messages(mid)
    assert len(msgs) == 1


def test_chat_message_validation():
    repo = MeetingRepository()
    m = repo.create_live_meeting({
        "titulo": "Reunião Validação Chat",
        "departamento": "Comercial",
        "data": "2026-10-14",
        "horario": "16:00"
    })
    mid = m["ID_MEETING"]

    with pytest.raises(ValueError, match="Mensagem de chat não pode ser vazia"):
        repo.add_chat_message(mid, "User", "   ")

    with pytest.raises(ValueError, match="não encontrada"):
        repo.add_chat_message("non_existent_id_9999", "User", "Texto")


def test_chat_does_not_affect_tasks_or_decisions():
    repo = MeetingRepository()
    m = repo.create_live_meeting({
        "titulo": "Reunião Sem Invenção de Tarefas",
        "departamento": "Financeiro",
        "data": "2026-10-14",
        "horario": "17:00",
        "iniciar_agora": True
    })
    mid = m["ID_MEETING"]

    # Participante escreve no chat frase com estrutura de tarefa e decisão
    repo.add_chat_message(mid, "Participante", "João deve entregar o relatório financeiro até sexta-feira com prioridade crítica.")
    repo.add_chat_message(mid, "Diretor", "Decidido: adiamos a compra do servidor.")

    # Re-recupera a reunião
    meeting = repo.get_by_id(mid)

    # Garante que tarefas e decisões NÃO foram populadas automaticamente por mensagens de chat
    resumo_ia = meeting.get("RESUMO_IA") or {}
    tarefas = resumo_ia.get("tarefas") or meeting.get("tarefas") or []
    assert len(tarefas) == 0, "Mensagens do chat não podem gerar tarefas automáticas"

    # Transcrição oficial também não deve ser alterada pelo chat
    assert meeting.get("TRANSCRIPT_NORMALIZED", "") == ""
    assert meeting.get("ANON_TRANSCRICAO", "") == ""


def test_chat_api_endpoints():
    repo = MeetingRepository()
    m = repo.create_live_meeting({
        "titulo": "Reunião Teste Endpoints Chat",
        "departamento": "RH",
        "data": "2026-10-14",
        "horario": "09:00",
        "iniciar_agora": True
    })
    mid = m["ID_MEETING"]

    # 1. GET lista vazia inicialmente
    resp = client.get(f"/api/live/meetings/{mid}/chat/messages")
    assert resp.status_code == 200
    data = resp.json()
    assert data["meeting_id"] == mid
    assert data["total"] == 0
    assert data["messages"] == []

    # 2. POST mensagem válida
    post_payload = {
        "author": "Alice TI",
        "text": "Link da documentação TOTVS compartilhado.",
        "client_message_id": "cmsg-api-123"
    }
    resp_post = client.post(f"/api/live/meetings/{mid}/chat/messages", json=post_payload)
    assert resp_post.status_code == 200
    msg_data = resp_post.json()
    assert msg_data["author"] == "Alice TI"
    assert msg_data["text"] == "Link da documentação TOTVS compartilhado."
    assert msg_data["client_message_id"] == "cmsg-api-123"

    # 3. GET lista com a mensagem criada
    resp_list = client.get(f"/api/live/meetings/{mid}/chat/messages")
    assert resp_list.status_code == 200
    list_data = resp_list.json()
    assert list_data["total"] == 1
    assert list_data["messages"][0]["id"] == msg_data["id"]

    # 4. POST com texto vazio -> HTTP 400 ou 422
    resp_bad = client.post(f"/api/live/meetings/{mid}/chat/messages", json={"author": "X", "text": "   "})
    assert resp_bad.status_code in [400, 422]
