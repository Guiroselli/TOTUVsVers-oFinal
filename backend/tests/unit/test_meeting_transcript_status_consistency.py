"""
Testes unitários para consistência de status de reunião entre transcrição capturada e análise (PARTE 4).
Garante que reuniões sem transcrição não sejam exibidas como aguardando análise e que a ata
não possa ser gerada sem texto de entrada.
"""
import pytest
from repositories import _normalize_live_fields, MeetingRepository


def test_normalize_meeting_without_transcript_sets_sem_transcricao():
    """
    Reunião sem transcrição e sem resumo_ia deve ter STATUS_ANALISE = 'sem_transcricao',
    mesmo que o registro contenha 'aguardando_analise'.
    """
    raw_item = {
        "ID_MEETING": "meeting-empty-1",
        "TITULO_REUNIAO": "Alinhamento Geral",
        "STATUS_MEETING": "concluida",
        "STATUS_ANALISE": "aguardando_analise",
        "ANON_TRANSCRICAO": "",
        "TRANSCRIPT_RAW": "",
        "TRANSCRIPT_NORMALIZED": "",
        "TRANSCRIPT_FINAL": "",
        "RESUMO_IA": None,
    }
    normalized = _normalize_live_fields(raw_item)
    assert normalized["STATUS_ANALISE"] == "sem_transcricao", (
        "Reunião sem nenhuma transcrição capturada deve ser normalizada para 'sem_transcricao'"
    )


def test_normalize_meeting_with_transcript_preserves_aguardando_analise():
    """
    Reunião com transcrição válida e sem resumo_ia deve manter STATUS_ANALISE = 'aguardando_analise'.
    """
    raw_item = {
        "ID_MEETING": "meeting-with-text-1",
        "TITULO_REUNIAO": "Alinhamento Técnico TI",
        "STATUS_MEETING": "concluida",
        "STATUS_ANALISE": "aguardando_analise",
        "ANON_TRANSCRICAO": "Discussão sobre deploy da release 2.1 e alinhamento de cronograma com o RH.",
        "RESUMO_IA": None,
    }
    normalized = _normalize_live_fields(raw_item)
    assert normalized["STATUS_ANALISE"] == "aguardando_analise"


def test_finalize_meeting_without_transcript_sets_sem_transcricao(tmp_path):
    """
    Ao finalizar uma reunião ao vivo sem áudio/transcrição capturada, o status deve ser 'sem_transcricao'.
    """
    dataset_file = str(tmp_path / "dataset.json")
    repo = MeetingRepository(dataset_path=dataset_file)

    # Cria reunião ao vivo
    meeting = repo.create_live_meeting({
        "ID_MEETING": "live-empty-1",
        "titulo": "Reunião Teste Silenciosa",
        "departamento": "Geral",
        "data": "2026-10-14",
        "horario": "15:00",
        "iniciar_agora": True
    })
    assert meeting["ID_MEETING"] == "live-empty-1"

    # Finaliza sem ter enviado chunks ou transcrição
    finalized = repo.update_live_meeting_status("live-empty-1", "finalizar")
    assert finalized is not None
    assert finalized["STATUS_MEETING"] == "concluida"
    assert finalized["STATUS_ANALISE"] == "sem_transcricao"


def test_finalize_meeting_with_transcript_sets_aguardando_analise(tmp_path):
    """
    Ao finalizar reunião com transcrição capturada, o status deve ser 'aguardando_analise'.
    """
    dataset_file = str(tmp_path / "dataset.json")
    repo = MeetingRepository(dataset_path=dataset_file)

    # Cria reunião ao vivo
    repo.create_live_meeting({
        "ID_MEETING": "live-with-text-1",
        "titulo": "Reunião Teste com Áudio",
        "departamento": "RH",
        "data": "2026-10-14",
        "horario": "16:00",
        "iniciar_agora": True
    })

    # Adiciona transcrição
    repo.update_live_transcript(
        "live-with-text-1",
        transcript="Discutimos a migração dos servidores e o prazo de entrega final.",
        is_incremental=False
    )

    # Finaliza reunião
    finalized = repo.update_live_meeting_status("live-with-text-1", "finalizar")
    assert finalized is not None
    assert finalized["STATUS_MEETING"] == "concluida"
    assert finalized["STATUS_ANALISE"] == "aguardando_analise"


def test_update_live_transcript_transitions_status_from_sem_transcricao_to_aguardando(tmp_path):
    """
    Quando uma reunião finalizada como sem_transcricao recebe transcrição posteriormente,
    seu status_analise deve transicionar para 'aguardando_analise'.
    """
    dataset_file = str(tmp_path / "dataset.json")
    repo = MeetingRepository(dataset_path=dataset_file)

    repo.create_live_meeting({
        "ID_MEETING": "live-late-trans-1",
        "titulo": "Reunião Tardia",
        "departamento": "Financeiro",
        "data": "2026-10-14",
        "horario": "17:00",
        "iniciar_agora": True
    })
    repo.update_live_meeting_status("live-late-trans-1", "finalizar")

    # Atualiza com texto tardio (ex: reprocessamento)
    updated = repo.update_live_transcript(
        "live-late-trans-1",
        transcript="Validação final das planilhas de faturamento.",
        is_incremental=False
    )
    assert updated["STATUS_ANALISE"] == "aguardando_analise"
