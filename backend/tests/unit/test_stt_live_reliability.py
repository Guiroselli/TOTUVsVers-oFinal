import pytest
from backend.consolidation import collapse_repetitive_loops, ChunkConsolidator
from backend.stt_service import get_stt_service


def test_collapse_repetitive_loops_pathological_ngrams():
    # 1-gram / 2-gram loop 'que é que é que é'
    loop_text = "que é que é que é que é que é"
    collapsed, audits = collapse_repetitive_loops(loop_text)
    assert collapsed.strip() == "que é"
    assert len(audits) >= 1
    assert audits[0]["rule"] == "repeticao_patologica"

    # Multi-word phrase loop
    loop_phrase = "vamos começar agora vamos começar agora vamos começar agora"
    collapsed_phrase, phrase_audits = collapse_repetitive_loops(loop_phrase)
    assert collapsed_phrase.strip() == "vamos começar agora"
    assert len(phrase_audits) >= 1

    # Legitimate non-pathological double repetition preserved
    natural_repetition = "não, não podemos fazer isso agora."
    cleaned_rep, rep_audits = collapse_repetitive_loops(natural_repetition)
    assert "não, não podemos" in cleaned_rep
    assert len(rep_audits) == 0

    # Standard corporate sentence unmodified
    normal = "Apresentamos o relatório de fechamento do terceiro trimestre."
    cleaned_norm, norm_audits = collapse_repetitive_loops(normal)
    assert cleaned_norm == normal
    assert len(norm_audits) == 0


def test_get_session_prompt_sanitization():
    stt = get_stt_service()
    session_id = "test_prompt_sess_001"
    try:
        # Context with repetitive hallucination
        stt._session_contexts[session_id] = "que é que é que é que é reunião de alinhamento"
        prompt = stt.get_session_prompt(session_id)
        # Verify prompt does not contain repeated loops
        assert prompt.count("que é") <= 1
        assert "reunião de alinhamento" in prompt
    finally:
        stt._session_contexts.pop(session_id, None)


def test_consolidator_speaker_dialogue_grouping():
    consolidator = ChunkConsolidator()
    chunks = [
        {
            "sequence": 1,
            "session_id": "sess1",
            "text": "Bom dia a todos, iniciando a nossa pauta.",
            "speaker_name": "Lucas",
            "timestamp": 100.0,
        },
        {
            "sequence": 2,
            "session_id": "sess1",
            "text": "Vamos revisar o cronograma de implantação.",
            "speaker_name": "Lucas",
            "timestamp": 103.0,
        },
        {
            "sequence": 3,
            "session_id": "sess1",
            "text": "Os testes de homologação foram concluídos com sucesso.",
            "speaker_name": "Mariana",
            "timestamp": 106.0,
        },
    ]

    r = consolidator.consolidate(chunks)
    transcript = r["transcript_final"]

    assert "[Lucas]:" in transcript
    assert "[Mariana]:" in transcript
    # Lucas spoken twice in a row should be grouped under one [Lucas]: header
    assert transcript.count("[Lucas]:") == 1
    assert "Bom dia a todos" in transcript
    assert "Vamos revisar o cronograma" in transcript
    assert "\n\n[Mariana]:" in transcript


def test_consolidator_mixed_audio_fallback():
    consolidator = ChunkConsolidator()
    chunks = [
        {
            "sequence": 1,
            "session_id": "sess1",
            "text": "Comentário feito pelo microfone da sala.",
            "speaker_name": "Falante não identificado",
            "timestamp": 100.0,
        }
    ]
    r = consolidator.consolidate(chunks)
    assert "[Falante não identificado]: Comentário feito pelo microfone da sala." in r["transcript_final"]


from backend.repositories import MeetingRepository


def test_update_live_transcript_manual_vs_autosave(tmp_path):
    temp_dataset = str(tmp_path / "test_meetings.json")
    repo = MeetingRepository(dataset_path=temp_dataset)
    meeting = repo.create_live_meeting({
        "titulo": "Alinhamento Teste",
        "departamento": "TI",
        "data": "2026-10-14",
        "horario": "14:00",
    })
    m_id = meeting["ID_MEETING"]

    # 1. Autosave / STT update (is_manual_edit=False)
    up1 = repo.update_live_transcript(m_id, "Texto transcrito automaticamente", is_manual_edit=False)
    assert up1["ANON_TRANSCRICAO"] == "Texto transcrito automaticamente"
    # TRANSCRIPT_CORRECTIONS remains empty
    assert len(up1.get("TRANSCRIPT_CORRECTIONS", [])) == 0

    # 2. Manual human correction (is_manual_edit=True)
    up2 = repo.update_live_transcript(m_id, "Texto corrigido manualmente pelo usuário", author="Lucas", is_manual_edit=True)
    assert up2["ANON_TRANSCRICAO"] == "Texto corrigido manualmente pelo usuário"
    assert len(up2.get("TRANSCRIPT_CORRECTIONS", [])) == 1
    assert up2["TRANSCRIPT_CORRECTIONS"][0]["author"] == "Lucas"
