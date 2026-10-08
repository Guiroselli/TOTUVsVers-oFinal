import pytest
from repositories import MeetingRepository


def test_repo_create_and_get_live_meetings():
    repo = MeetingRepository()
    created = repo.create_live_meeting({
        "titulo": "Reunião de RH Especial",
        "departamento": "RH",
        "horario": "10:20",
        "participantes": ["Alice", "Bob"],
        "fonte_audio": "Microfone 1",
        "iniciar_agora": False
    })

    assert created["ID_MEETING"] is not None
    assert created["TITULO_REUNIAO"] == "Reunião de RH Especial"
    assert created["DEPARTAMENTO"] == "RH"
    assert created["HORARIO_AGENDADO"] == "10:20"
    assert created["STATUS_MEETING"] == "agendada"
    assert created["PARTICIPANTES"] == ["Alice", "Bob"]
    assert created["FONTE_AUDIO"] == "Microfone 1"

    # Busca por ID
    found = repo.get_by_id(created["ID_MEETING"])
    assert found is not None
    assert found["TITULO_REUNIAO"] == "Reunião de RH Especial"


def test_repo_status_transitions():
    repo = MeetingRepository()
    m = repo.create_live_meeting({"titulo": "Transições", "horario": "10:20", "iniciar_agora": False})
    mid = m["ID_MEETING"]

    # Iniciar
    st1 = repo.update_live_meeting_status(mid, "iniciar")
    assert st1["STATUS_MEETING"] == "ao_vivo"
    assert st1["STARTED_AT"] is not None

    # Pausar
    st2 = repo.update_live_meeting_status(mid, "pausar")
    assert st2["STATUS_MEETING"] == "pausada"
    assert st2["PAUSED_AT"] is not None

    # Retomar
    st3 = repo.update_live_meeting_status(mid, "retomar")
    assert st3["STATUS_MEETING"] == "ao_vivo"

    # Finalizar
    st4 = repo.update_live_meeting_status(mid, "finalizar")
    assert st4["STATUS_MEETING"] == "concluida"
    assert st4["FINISHED_AT"] is not None

    # Ação inválida retorna None
    assert repo.update_live_meeting_status(mid, "acao_inexistente") is None


def test_repo_transcript_isolation_and_incremental():
    repo = MeetingRepository()
    m1 = repo.create_live_meeting({"titulo": "Sala 1", "horario": "10:20"})
    m2 = repo.create_live_meeting({"titulo": "Sala 2", "horario": "10:20"})

    id1 = m1["ID_MEETING"]
    id2 = m2["ID_MEETING"]

    repo.update_live_transcript(id1, "Primeira fala", is_incremental=False)
    repo.update_live_transcript(id1, "Segunda fala", is_incremental=True)

    repo.update_live_transcript(id2, "Fala isolada da sala 2", is_incremental=False)

    res1 = repo.get_by_id(id1)
    res2 = repo.get_by_id(id2)

    assert "Primeira fala Segunda fala" in res1["ANON_TRANSCRICAO"]
    assert "Fala isolada da sala 2" in res2["ANON_TRANSCRICAO"]
    assert "Segunda fala" not in res2["ANON_TRANSCRICAO"]
