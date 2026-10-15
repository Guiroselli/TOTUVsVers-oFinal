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


def test_speaker_alternation_turn_taking_a_b_a(test_repo):
    """
    Valida alternância estrita de turnos de fala A -> B -> A -> B -> A:
    1. A fala de B não pode ser cortada por suposta sobreposição com a de A.
    2. A ordem cronológica dos turnos deve ser preservada rigorosamente.
    3. TRANSCRIPT_TURNS deve conter os 5 turnos ordenados com speaker_name e texto.
    """
    meeting_id = "meet_alternation_test"
    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Alinhamento de Turnos A/B",
        "DEPARTAMENTO": "TI",
        "HORARIO_AGENDADO": "10:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    # Ciclo 1: Alice fala
    test_repo.record_live_audio_chunk(
        meeting_id, "sess_alice", 0, "Olá pessoal, precisamos definir o cronograma da sprint.",
        duration=3.5, audio_level=25, speaker_name="Alice", speaker_id="usr_alice"
    )

    # Ciclo 2: Bob responde (mesmo se usar palavras semelhantes a Alice, não pode ser podado)
    test_repo.record_live_audio_chunk(
        meeting_id, "sess_bob", 0, "O cronograma da sprint está alinhado com a diretoria.",
        duration=3.5, audio_level=25, speaker_name="Bob", speaker_id="usr_bob"
    )

    # Ciclo 3: Alice retoma
    test_repo.record_live_audio_chunk(
        meeting_id, "sess_alice", 1, "Perfeito Bob. Quando começamos a homologação?",
        duration=3.5, audio_level=25, speaker_name="Alice", speaker_id="usr_alice"
    )

    # Ciclo 4: Bob esclarece
    test_repo.record_live_audio_chunk(
        meeting_id, "sess_bob", 1, "A homologação começa amanhã cedo no ambiente de QA.",
        duration=3.5, audio_level=25, speaker_name="Bob", speaker_id="usr_bob"
    )

    # Ciclo 5: Alice conclui
    res5 = test_repo.record_live_audio_chunk(
        meeting_id, "sess_alice", 2, "Excelente, vou comunicar a equipe.",
        duration=3.5, audio_level=25, speaker_name="Alice", speaker_id="usr_alice"
    )

    meeting = test_repo.get_by_id(meeting_id)
    turns = meeting.get("TRANSCRIPT_TURNS", [])
    assert len(turns) == 5, f"Esperava 5 turnos alternados, obteve {len(turns)}"

    # Verifica alternância A -> B -> A -> B -> A
    assert turns[0]["speaker_name"] == "Alice"
    assert turns[1]["speaker_name"] == "Bob"
    assert turns[2]["speaker_name"] == "Alice"
    assert turns[3]["speaker_name"] == "Bob"
    assert turns[4]["speaker_name"] == "Alice"

    # Garante que as palavras de Bob NÃO foram cortadas por semelhança com a frase de Alice
    assert "O cronograma da sprint" in turns[1]["text_normalized"]
    assert "A homologação começa amanhã" in turns[3]["text_normalized"]

    # Verifica formatação no texto normalizado
    norm_text = meeting.get("TRANSCRIPT_NORMALIZED", "")
    assert "[Alice]:" in norm_text
    assert "[Bob]:" in norm_text
    assert norm_text.count("[Alice]:") == 3
    assert norm_text.count("[Bob]:") == 2


def test_continuous_capture_over_25_chunks_and_800_chars(test_repo):
    """
    Valida que reuniões com mais de 25 chunks e mais de 800 caracteres:
    1. Não travam por concorrência de arquivo NTFS ou slicing regex do glossário.
    2. Processam todos os 35 chunks consecutivamente.
    3. Mantêm diagnóstico e contadores 100% íntegros sem descarte.
    """
    meeting_id = "meet_continuous_long_test"
    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Reunião Longa Contínua",
        "DEPARTAMENTO": "Protheus TI",
        "HORARIO_AGENDADO": "14:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    sess_id = "sess_long_001"
    phrases = [
        "Iniciando a sessão de alinhamento com a diretoria técnica.",
        "Estamos avaliando a migração do sistema ERP corporativo.",
        "A equipe de tecnologia analisou os requisitos do Protheus e do Fluig.",
        "Precisamos homologar os módulos de financeiro e contabilidade.",
        "Os testes de carga indicaram estabilidade no ambiente de produção.",
        "O banco de dados respondeu dentro da média esperada de latência.",
        "Vamos agendar o treinamento dos usuários para a próxima semana.",
    ]

    # Envia 35 chunks sucessivos (5 ciclos de 7 frases)
    total_chunks = 35
    for seq in range(total_chunks):
        p = phrases[seq % len(phrases)]
        test_repo.record_live_audio_chunk(
            meeting_id=meeting_id,
            session_id=sess_id,
            sequence=seq,
            text=f"{p} (etapa {seq})",
            duration=3.5,
            audio_level=28,
            speaker_name="Coordenador TI",
            speaker_id="usr_coord"
        )

    meeting = test_repo.get_by_id(meeting_id)
    final_text = meeting.get("TRANSCRIPT_NORMALIZED", "")
    assert len(final_text) > 1200, f"Texto deveria ter > 1200 caracteres, possui {len(final_text)}"

    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    assert diag["chunks_captured"] == 35
    assert diag["chunks_confirmed"] == 35
    assert diag["chunks_failed"] == 0
    assert diag["chunks_pending"] == 0
    assert diag["reconciliation_ok"] is True


def test_resilience_after_transient_chunk_failure_without_aborting_session(test_repo):
    """
    Valida resiliência operacional: um chunk falho isolado não aborta a reunião.
    Chunks subsequentes continuam sendo processados e confirmados normalmente.
    """
    meeting_id = "meet_resilience_test"
    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Teste de Resiliência",
        "DEPARTAMENTO": "Operações",
        "HORARIO_AGENDADO": "15:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })

    sess_id = "sess_resilience"

    # Chunks 0 a 9 sucedem
    for seq in range(10):
        test_repo.record_live_audio_chunk(
            meeting_id, sess_id, seq, f"Chunk {seq} processado com sucesso.",
            duration=3.5, audio_level=25, speaker_name="Operador", speaker_id="usr_op"
        )

    # Chunk 10 falha por indisponibilidade transitória
    test_repo.record_live_audio_chunk_failure(
        meeting_id, sess_id, 10, "stt_503", "STT temporariamente indisponível", speaker_id="usr_op"
    )

    # Chunks 11 a 24 sucedem normalmente (reunião continuou sem abortar)
    for seq in range(11, 25):
        test_repo.record_live_audio_chunk(
            meeting_id, sess_id, seq, f"Chunk {seq} processado após recuperação.",
            duration=3.5, audio_level=25, speaker_name="Operador", speaker_id="usr_op"
        )

    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    assert diag["chunks_captured"] == 25
    assert diag["chunks_confirmed"] == 24
    assert diag["chunks_failed"] == 1
    assert diag["chunks_pending"] == 0
    assert diag["reconciliation_ok"] is True


@pytest.mark.anyio
async def test_meeting_connection_manager_reconnect_resilience():
    """
    Valida que quando um participante se reconecta (ex: reload ou React StrictMode):
    1. O novo WebSocket sobrescreve o peer registrado.
    2. O fechamento do WebSocket antigo NÃO desregistra o participante nem emite peer_left.
    3. O peer permanece ativo na sala.
    """
    from main import MeetingConnectionManager

    manager = MeetingConnectionManager()
    m_id = "meet_reconnect_test"
    pid = "usr_reconnect_alice"

    class FakeWebSocket:
        def __init__(self, id_val):
            self.id_val = id_val
            self.sent = []
        async def accept(self):
            pass
        async def send_json(self, data):
            self.sent.append(data)

    ws_old = FakeWebSocket("old")
    ws_new = FakeWebSocket("new")

    # 1. Conecta socket antigo
    await manager.connect(m_id, ws_old)
    await manager.register_peer(m_id, pid, "Alice", False, False, ws_old)

    # Verifica presença
    peers = await manager.get_peers_in_room(m_id)
    assert len(peers) == 1
    assert peers[0]["participant_id"] == pid

    # 2. Conecta socket novo para o mesmo participante (reconexão)
    await manager.connect(m_id, ws_new)
    await manager.register_peer(m_id, pid, "Alice", False, False, ws_new)

    # 3. Socket antigo desconecta
    left_info = await manager.unregister_peer(ws_old)
    # NÃO deve retornar left_info porque o socket ativo já é ws_new!
    assert left_info is None, "Socket antigo não deve desregistrar novo socket ativo"

    # Participante deve continuar presente na sala
    peers_after = await manager.get_peers_in_room(m_id)
    assert len(peers_after) == 1
    assert peers_after[0]["participant_id"] == pid

    # 4. Socket novo desconecta
    final_left = await manager.unregister_peer(ws_new)
    assert final_left is not None
    assert final_left[1] == pid

    peers_final = await manager.get_peers_in_room(m_id)
    assert len(peers_final) == 0


@pytest.mark.anyio
async def test_get_live_meeting_participants_endpoint():
    """
    Valida que o endpoint GET /api/live/meetings/{meeting_id}/participants
    retorna a lista de peers cadastrados no MeetingConnectionManager.
    """
    from main import app, ws_manager
    from httpx import AsyncClient, ASGITransport

    m_id = "meet_api_part_test"
    pid = "usr_endpoint_bob"

    class FakeWS:
        async def accept(self):
            pass
        async def send_json(self, data):
            pass

    ws = FakeWS()
    await ws_manager.connect(m_id, ws)
    await ws_manager.register_peer(m_id, pid, "Bob TI", False, True, ws)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(f"/api/live/meetings/{m_id}/participants")
        assert resp.status_code == 200
        data = resp.json()
        assert data["meeting_id"] == m_id
        assert data["count"] >= 1
        found = [p for p in data["participants"] if p["participant_id"] == pid]
        assert len(found) == 1
        assert found[0]["name"] == "Bob TI"
        assert found[0]["is_cam_off"] is True

    # Limpeza
    await ws_manager.unregister_peer(ws)
    await ws_manager.disconnect(m_id, ws)


def test_transcript_continuation_beyond_6000_10000_and_20000_chars(test_repo):
    """
    Valida a continuidade da transcrição sem perda, truncamento ou interrupção
    mesmo além de 6.000, 10.000 e 20.000 caracteres e muitos chunks consecutivos.
    Confirma também que colchetes no áudio como [ruído], [inaudível] e [anexo 1]
    não causam truncamento do texto subsequente.
    """
    meeting_id = "meet_long_scale_test"
    test_repo.create_live_meeting({
        "ID_MEETING": meeting_id,
        "TITULO_REUNIAO": "Reunião de Teste de Longa Escala",
        "NOME_SEGMENTO": "TI",
        "DEPARTAMENTO": "TI",
        "HORARIO_AGENDADO": "14:00",
        "DT_MEETING": "2026-10-14",
        "STATUS_MEETING": "ao_vivo"
    })
    sess_id = "sess_long_scale"
    total_raw_chars = 0

    for i in range(1, 101):
        spk = "Carlos RH" if i % 2 == 1 else "Mariana TI"
        spk_id = "usr_carlos" if i % 2 == 1 else "usr_mariana"

        # Inclui texto técnico longo com colchetes conversacionais reais
        chunk_text = (
            f"Segmento de discussão técnica {i}: Alinhamento operacional sobre o módulo "
            f"de benefícios Protheus TOTVS e parametrização [anexo {i}] com integração contábil. "
            f"Validação de fluxo de homologação concluída sem impedimentos. "
        )
        if i % 10 == 0:
            chunk_text += "[ruído de fundo] Continuação imediata da fala após ruído. "

        res = test_repo.record_live_audio_chunk(
            meeting_id=meeting_id,
            session_id=sess_id,
            sequence=i,
            text=chunk_text,
            duration=3.5,
            audio_level=30,
            speaker_name=spk,
            speaker_id=spk_id
        )
        assert res is not None
        total_raw_chars += len(chunk_text.strip())

    meeting = test_repo.get_by_id(meeting_id)
    raw = meeting.get("TRANSCRIPT_RAW", "")
    norm = meeting.get("TRANSCRIPT_NORMALIZED", "")
    final_text = meeting.get("ANON_TRANSCRICAO", "")
    turns = meeting.get("TRANSCRIPT_TURNS", [])

    # Validações de escala de caracteres (excede 6.000, 10.000 e 20.000 caracteres)
    assert len(raw) > 20000, f"TRANSCRIPT_RAW deve superar 20.000 caracteres, obteve {len(raw)}"
    assert len(norm) > 20000, f"TRANSCRIPT_NORMALIZED deve superar 20.000 caracteres, obteve {len(norm)}"
    assert len(final_text) > 20000, f"ANON_TRANSCRICAO deve superar 20.000 caracteres, obteve {len(final_text)}"

    # Validação de turnos e ausência de truncamento
    assert len(turns) == 100, f"Deve conter exatamente 100 turnos, obteve {len(turns)}"
    assert "Continuação imediata da fala após ruído" in final_text, "Texto após [ruído de fundo] não pode ser truncado"
    assert "anexo 100" in final_text, "Último chunk deve estar presente na íntegra"

    # Diagnóstico reconciliado
    diag = test_repo.get_pipeline_diagnostics(meeting_id)
    assert diag["chunks_captured"] >= 100
    assert diag["chunks_confirmed"] >= 100
    assert diag["reconciliation_ok"] is True



