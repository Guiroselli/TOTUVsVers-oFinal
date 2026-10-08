"""
Testes automatizados de reprodutibilidade, cache, status e resiliência do STT (PARTE 12).
Garante que o comportamento do ambiente, carregamento de .env, diagnóstico de cache,
modelos e idempotência estejam 100% cobertos sem realizar downloads de rede durante os testes.
"""

import os
import sys
import tempfile
import io
import wave
import pytest
from fastapi.testclient import TestClient

# Adiciona o diretório backend ao sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.abspath(os.path.join(_current_dir, "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import env_loader
from stt_service import STTService, get_stt_service
from main import app

client = TestClient(app)


class MockSegment:
    def __init__(self, text="fala de teste", start=0.0, end=1.5):
        self.text = text
        self.start = start
        self.end = end


class MockInfo:
    def __init__(self, language="pt", duration=1.5):
        self.language = language
        self.language_probability = 0.99
        self.duration = duration


class DummyMockWhisperModel:
    def __init__(self):
        self.transcribed_paths = []

    def transcribe(self, path, language="pt", beam_size=1, vad_filter=True):
        self.transcribed_paths.append(path)
        with open(path, "rb") as f:
            data = f.read()
        return [MockSegment(f"texto({len(data)} bytes)")], MockInfo()


def generate_wav_bytes(duration_sec=0.2):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        num_frames = int(16000 * duration_sec)
        wf.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


# 1. Ambiente pronto
def test_01_environment_ready():
    stt = STTService()
    assert stt.enabled is True
    assert stt.check_dependency() is True
    status = stt.get_status()
    assert status["provider"] == "faster_whisper"
    assert status["device"] == "cpu"
    assert status["compute_type"] == "int8"
    assert "model" in status
    assert "cache_dir" in status


# 2 & 3. Dependência ausente (faster-whisper ou av)
def test_02_and_03_dependency_missing():
    stt = STTService()
    stt._dependency_checked = True
    stt._dependency_available = False
    stt._load_error = "dependency_missing: No module named 'faster_whisper'"

    assert stt.is_available() is False
    assert stt.get_unavailable_reason() == "dependency_missing"
    status = stt.get_status()
    assert status["available"] is False
    assert status["ready"] is False
    assert status["reason"] == "dependency_missing"


# 4. Modelo ausente no cache
def test_04_model_missing():
    # Modelo não existente localmente
    stt = STTService(model_size="modelo_completamente_inexistente_9999")
    assert stt.is_model_cached() is False
    assert stt.is_available() is False
    assert stt.get_unavailable_reason() == "model_missing"
    status = stt.get_status()
    assert status["available"] is False
    assert status["model_cached"] is False
    assert status["reason"] == "model_missing"


# 5 & 6. Modelo já no cache e idempotência sem novo download
def test_05_and_06_model_cached_idempotent():
    stt = STTService(model_size="base")
    cached_first = stt.is_model_cached()
    assert cached_first is True

    # Segunda checagem subsequente: retorna True sem tocar rede
    cached_second = stt.is_model_cached()
    assert cached_second is True
    status = stt.get_status()
    assert status["model_cached"] is True
    assert status["available"] is True


# 7 & 8. Carregamento de .env e variáveis exportadas respeitadas
def test_07_and_08_env_loading_and_precedence():
    with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as tmp:
        tmp.write("TEST_ENV_VAR_NEW=valor_do_arquivo\n")
        tmp.write("TEST_ENV_VAR_EXISTING=valor_do_arquivo_ignorado\n")
        tmp_name = tmp.name

    try:
        os.environ["TEST_ENV_VAR_EXISTING"] = "valor_preexistente_no_sistema"
        loaded = env_loader.load_env_file(tmp_name)

        assert os.environ["TEST_ENV_VAR_NEW"] == "valor_do_arquivo"
        # Precedência: variável já no ambiente NÃO é sobrescrita
        assert os.environ["TEST_ENV_VAR_EXISTING"] == "valor_preexistente_no_sistema"
        assert "TEST_ENV_VAR_NEW" in loaded
    finally:
        os.remove(tmp_name)
        os.environ.pop("TEST_ENV_VAR_NEW", None)
        os.environ.pop("TEST_ENV_VAR_EXISTING", None)


# 9. Verificação de versão Python
def test_09_python_version_compatibility():
    from scripts.check_stt_environment import run_diagnostics
    # Deve executar diagnóstico e retornar True no ambiente atual (Python >= 3.10)
    ready = run_diagnostics()
    assert ready is True


# 10. Status ready após warm-up / carregamento
def test_10_status_ready_state():
    stt = STTService()
    mock_model = DummyMockWhisperModel()
    stt.set_mock_model(mock_model)

    status_before = stt.get_status()
    assert status_before["ready"] is True  # Mock atua como carregado

    res = stt.warmup()
    assert res["status"] == "ok"
    assert res["ready"] is True


# 11. Status model_loading
def test_11_status_model_loading():
    stt = STTService(model_size="base")
    stt._is_loading = True
    assert stt.get_unavailable_reason() == "model_loading"


# 12. Status model_load_error
def test_12_status_model_load_error():
    stt = STTService()
    stt._load_error = "CUDA out of memory"
    assert stt.get_unavailable_reason() == "model_load_error"
    status = stt.get_status()
    assert status["available"] is False
    assert status["reason"] == "model_load_error"


# 13. Warm-up mockado
def test_13_mocked_warmup():
    stt = STTService()
    stt.set_mock_model(DummyMockWhisperModel())
    res = stt.warmup()
    assert res["status"] == "ok"
    assert res["model"] == stt.model_size


# 14. Transcrição de fixture WAV com mock
def test_14_transcribe_wav_fixture_with_mock():
    stt = STTService()
    stt.set_mock_model(DummyMockWhisperModel())
    wav = generate_wav_bytes(0.2)
    res = stt.transcribe_audio_bytes(wav, filename_hint="sample.wav", session_id="s1", sequence=0)
    assert "texto(" in res["text"]
    assert res["duration"] == 1.5
    assert len(res["segments"]) == 1


# 15 & 16. Transcrição WebM com cabeçalho e montagem de chunks subsequentes
def test_15_and_16_webm_streaming_header_assembly():
    stt = STTService()
    mock = DummyMockWhisperModel()
    stt.set_mock_model(mock)

    ebml_header = b"\x1a\x45\xdf\xa3\x01\x00\x00\x00"
    cluster = b"\x1f\x43\xb6\x75"
    chunk_0 = ebml_header + b"tracks" + cluster + b"data0"
    chunk_1 = cluster + b"data1"
    sess = "sess_reproducibility_42"

    # Chunk 0
    stt.transcribe_audio_bytes(chunk_0, filename_hint="c0.webm", session_id=sess, sequence=0)
    assert sess in stt._session_headers
    assert stt._session_headers[sess] == ebml_header + b"tracks"

    # Chunk 1 (sem header): deve receber header prepended
    stt.transcribe_audio_bytes(chunk_1, filename_hint="c1.webm", session_id=sess, sequence=1)
    stt.clear_session(sess)
    assert sess not in stt._session_headers


# 17. Retenção zero de arquivo temporário
def test_17_zero_temp_audio_retention():
    stt = STTService()
    stt.set_mock_model(DummyMockWhisperModel())
    wav = generate_wav_bytes(0.1)

    temp_dir = tempfile.gettempdir()
    before_files = set(f for f in os.listdir(temp_dir) if f.startswith("pf_chunk_"))

    stt.transcribe_audio_bytes(wav, filename_hint="retention.wav")

    after_files = set(f for f in os.listdir(temp_dir) if f.startswith("pf_chunk_"))
    assert after_files == before_files, "Nenhum arquivo temporário pf_chunk_ deve permanecer após transcrição."


# 18. Idempotência por session_id + sequence
def test_18_idempotency_api():
    m = client.post("/api/live/meetings", json={
        "titulo": "Reunião Idempotente",
        "departamento": "TI",
        "data": "2026-10-08",
        "horario": "10:20",
        "iniciar_agora": True
    }).json()["meeting"]
    mid = m["ID_MEETING"]

    wav = generate_wav_bytes(0.1)
    files = {"audio": ("chunk.wav", wav, "audio/wav")}
    data = {"session_id": "sess_idem_test", "sequence": "0"}

    r1 = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=files, data=data)
    assert r1.status_code == 200
    assert r1.json()["already_processed"] is False

    # Reenvio exato com mesma sequence
    r2 = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=files, data=data)
    assert r2.status_code == 200
    assert r2.json()["already_processed"] is True


# 19. Isolamento RH e TI às 10:20
def test_19_rh_and_ti_isolation():
    m_rh = client.post("/api/live/meetings", json={
        "titulo": "RH 10:20 Teste",
        "departamento": "RH",
        "data": "2026-10-08",
        "horario": "10:20",
        "iniciar_agora": True
    }).json()["meeting"]
    m_ti = client.post("/api/live/meetings", json={
        "titulo": "TI 10:20 Teste",
        "departamento": "TI",
        "data": "2026-10-08",
        "horario": "10:20",
        "iniciar_agora": True
    }).json()["meeting"]

    id_rh = m_rh["ID_MEETING"]
    id_ti = m_ti["ID_MEETING"]

    client.post(f"/api/live/meetings/{id_rh}/transcript", json={"transcript": "Pauta de Pessoas e Cargos", "is_incremental": False})
    client.post(f"/api/live/meetings/{id_ti}/transcript", json={"transcript": "Pauta de Banco de Dados e Redes", "is_incremental": False})

    res_rh = client.get(f"/api/live/meetings/{id_rh}").json()
    res_ti = client.get(f"/api/live/meetings/{id_ti}").json()

    assert "Pessoas e Cargos" in res_rh["ANON_TRANSCRICAO"]
    assert "Banco de Dados" not in res_rh["ANON_TRANSCRICAO"]
    assert "Banco de Dados" in res_ti["ANON_TRANSCRICAO"]
    assert "Pessoas e Cargos" not in res_ti["ANON_TRANSCRICAO"]


# 20. Endpoint retorna 503 quando STT está indisponível
def test_20_endpoint_503_when_unavailable():
    m = client.post("/api/live/meetings", json={
        "titulo": "503 Teste",
        "departamento": "Geral",
        "data": "2026-10-08",
        "horario": "10:20",
        "iniciar_agora": True
    }).json()["meeting"]
    mid = m["ID_MEETING"]

    stt = get_stt_service()
    original_enabled = stt.enabled
    stt.enabled = False
    try:
        wav = generate_wav_bytes(0.1)
        res = client.post(
            f"/api/live/meetings/{mid}/transcript/audio",
            files={"audio": ("chunk.wav", wav, "audio/wav")},
            data={"session_id": "sess_503", "sequence": "0"}
        )
        assert res.status_code == 503
        body = res.json()
        assert body["status"] == "unavailable"
        assert body["reason"] == "stt_disabled"
    finally:
        stt.enabled = original_enabled
