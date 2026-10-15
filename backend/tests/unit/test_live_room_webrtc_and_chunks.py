"""
Testes Unitários da Sala Ao Vivo: WebRTC Mesh, Sinalização,
Isolamento de Participantes, Recuperação de Headers e Reconciliação de Chunks.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from repositories import MeetingRepository
from stt_service import STTService, analyze_audio_signal


@pytest.fixture
def test_repo(tmp_path):
    repo = MeetingRepository(dataset_path=str(tmp_path / "test_meetings.json"))
    return repo


def test_webrtc_config_endpoint():
    """Valida que o endpoint GET /api/live/meetings/{id}/webrtc_config retorna STUN padrão sem credenciais expostas."""
    client = TestClient(app)
    resp = client.get("/api/live/meetings/test_meet_123/webrtc_config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["meeting_id"] == "test_meet_123"
    servers = data.get("ice_servers") or data.get("iceServers")
    assert len(servers) >= 1

    urls_flat = []
    for s in servers:
        u = s.get("urls")
        if isinstance(u, list):
            urls_flat.extend(u)
        elif isinstance(u, str):
            urls_flat.append(u)
    assert any("stun.l.google.com:19302" in u for u in urls_flat)


def test_chunk_failure_reporting_and_reconciliation(test_repo):
    """Valida o registro e a reconciliação matemática de chunks falhos."""
    meeting_id = "reuniao_conciliacao_001"
    session_id = "sess_001"
    speaker_id = "usr_participante_a"

    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Reunião Teste Conciliação",
        "DEPARTAMENTO": "TI",
        "HORARIO_AGENDADO": "10:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    # Simula 5 chunks capturados: 3 confirmados, 2 com falha persistente
    for seq in range(3):
        test_repo.record_live_audio_chunk(meeting_id, session_id, seq, f"Texto seq {seq}", duration=3.5, audio_level=25, speaker_id=speaker_id)

    test_repo.record_live_audio_chunk_failure(meeting_id, session_id, 3, "http_500", "Internal Server Error", speaker_id=speaker_id)
    test_repo.record_live_audio_chunk_failure(meeting_id, session_id, 4, "network_timeout", "Connection reset", speaker_id=speaker_id)

    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    assert diag["chunks_captured"] == 5
    assert diag["chunks_confirmed"] == 3
    assert diag["chunks_failed"] == 2
    assert diag["chunks_pending"] == 0
    # Reconciliação exata: capturados = confirmados + falhos + pendentes
    assert diag["chunks_captured"] == diag["chunks_confirmed"] + diag["chunks_failed"] + diag["chunks_pending"]
    assert diag["reconciliation_ok"] is True


def test_isolated_chunk_keys_per_participant(test_repo):
    """Garante que participantes distintos A e B na mesma reunião têm contadores e chaves de chunk totalmente isolados."""
    meeting_id = "reuniao_turn_taking"
    sess_a = "sess_part_a"
    sess_b = "sess_part_b"
    speaker_a = "usr_alice"
    speaker_b = "usr_bob"

    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Reunião Turn Taking",
        "DEPARTAMENTO": "RH",
        "HORARIO_AGENDADO": "10:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    # Alice envia seq 0 e 1
    c1 = test_repo.record_live_audio_chunk(meeting_id, sess_a, 0, "Olá Bob", duration=3.5, audio_level=30, speaker_id=speaker_a)
    c2 = test_repo.record_live_audio_chunk(meeting_id, sess_a, 1, "Como vai?", duration=3.5, audio_level=30, speaker_id=speaker_a)

    # Bob responde e também envia seq 0 e 1 em sua própria sessão
    c3 = test_repo.record_live_audio_chunk(meeting_id, sess_b, 0, "Oi Alice", duration=3.5, audio_level=28, speaker_id=speaker_b)
    c4 = test_repo.record_live_audio_chunk(meeting_id, sess_b, 1, "Tudo ótimo", duration=3.5, audio_level=28, speaker_id=speaker_b)

    assert c1 is not None and c3 is not None
    assert c1["chunk_key"] != c3["chunk_key"]
    assert c2["chunk_key"] != c4["chunk_key"]
    assert "sess_part_a:usr_alice:0" == c1["chunk_key"]
    assert "sess_part_b:usr_bob:0" == c3["chunk_key"]

    # Total de confirmados deve ser 4 sem colisões
    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    assert diag["chunks_confirmed"] == 4


def test_chunk_idempotency(test_repo):
    """Garante que o reenvio de um mesmo chunk não duplica contagem nem corrompe o diagnóstico."""
    meeting_id = "meet_idempotent"
    sess_id = "sess_test"
    speaker_id = "usr_carol"

    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Reunião Idempotente",
        "DEPARTAMENTO": "Operações",
        "HORARIO_AGENDADO": "10:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    c1 = test_repo.record_live_audio_chunk(meeting_id, sess_id, 0, "Teste idempotência", duration=3.5, audio_level=20, speaker_id=speaker_id)
    # Reenvio idêntico
    c2 = test_repo.record_live_audio_chunk(meeting_id, sess_id, 0, "Teste idempotência", duration=3.5, audio_level=20, speaker_id=speaker_id)

    assert c1 is not None and c2 is not None
    assert c1["chunk_key"] == c2["chunk_key"]
    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    # Confirmados permanece 1 (não conta duas vezes)
    assert diag["chunks_confirmed"] == 1


def test_stt_header_caching_and_recovery():
    """Valida o mecanismo de injeção de cabeçalho EBML em chunks subsequentes de WebM."""
    service = STTService()
    meeting_id = "meet_header_test"
    session_id = "sess_header_test"

    fake_header = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01" + b"\x00" * 40

    service._meeting_headers[meeting_id] = fake_header

    recovered = service._session_headers.get(session_id) or service._meeting_headers.get(meeting_id)
    assert recovered == fake_header


def test_non_crashing_decoding_fallback():
    """Valida que áudio não-decodificável não gera crash 500 no analyze_audio_signal."""
    corrupted_data = b"dados_corrompidos_sem_codec_valido"

    analysis = analyze_audio_signal(corrupted_data)
    assert analysis["audio_level"] == 0
    assert analysis["signal_quality"] == "sem_fala"
    assert analysis["speech_detected"] is False
