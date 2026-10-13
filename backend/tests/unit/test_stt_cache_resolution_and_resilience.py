"""
Suíte de testes automatizados para Resolução Canônica de Cache e Resiliência STT do Proton Flow:
1. Resolução de STT_MODEL_CACHE_DIR=./models a partir da raiz do repositório.
2. Resolução de STT_MODEL_CACHE_DIR=./models a partir de backend/.
3. Preservação de caminhos absolutos existentes.
4. Resolução de caminhos com ~.
5. Comportamento com dependência ausente (dependency_missing).
6. Comportamento com modelo ausente (model_missing).
7. Comportamento com modelo presente e carregável (is_available=True, ready=True).
8. Comportamento com falha real de carregamento (model_load_error) com log detalhado.
9. Fallback seguro de CUDA para CPU INT8.
10. Comportamento com áudio em silêncio (não alucinar texto).
11. Inferência com áudio PCM WAV.
12. Inferência com áudio WebM/Opus e montagem de cabeçalho.
13. Respeito à idempotência de chunks repetidos (meeting_id, session_id, sequence).
14. Não permanência de arquivos temporários após transcrição ou erro (zero retenção).
15. Isolamento estrito entre duas reuniões simultâneas no mesmo segundo.
16. Resposta HTTP 503 estruturada da API quando STT desabilitado ou indisponível.
"""

import os
import sys
import io
import math
import struct
import wave
import tempfile
import threading
from typing import Dict, Any, List
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Garante path correto
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from path_utils import get_project_root, resolve_model_cache_dir
from stt_service import STTService, get_stt_service
from repositories import MeetingRepository
from main import app


# ---------------------------------------------------------------------------
# Helpers para geração de áudio sintético e mocks de teste
# ---------------------------------------------------------------------------

def _generate_wav_bytes(duration_sec: float = 0.2, amplitude: int = 8000, freq: float = 440.0, sample_rate: int = 16000) -> bytes:
    """Gera bytes PCM WAV sintéticos válidos para testes de STT."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        num_frames = int(sample_rate * duration_sec)
        frames = bytearray()
        for i in range(num_frames):
            if amplitude == 0:
                val = 0
            else:
                val = int(amplitude * math.sin(2 * math.pi * freq * (i / sample_rate)))
            frames.extend(struct.pack("<h", max(-32768, min(32767, val))))
        wf.writeframes(frames)
    return buf.getvalue()


class MockSegment:
    def __init__(self, text: str, start: float = 0.0, end: float = 2.0, avg_logprob: float = -0.15, no_speech_prob: float = 0.02, compression_ratio: float = 1.1):
        self.text = text
        self.start = start
        self.end = end
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob
        self.compression_ratio = compression_ratio


class MockWhisperModel:
    def __init__(self, text: str = "Alinhamento operacional Proton Flow TOTVS"):
        self.text = text

    def transcribe(self, audio_path: str, **kwargs):
        seg = MockSegment(self.text)
        info = MagicMock()
        info.language = "pt"
        info.language_probability = 0.99
        info.duration = 2.0
        return [seg], info


# ---------------------------------------------------------------------------
# 1 & 2. Resolução Canônica de Cache a partir da Raiz e de backend/
# ---------------------------------------------------------------------------

def test_01_cache_dir_resolution_from_repo_root():
    """1: STT_MODEL_CACHE_DIR=./models a partir da raiz resolve para <raiz>/models."""
    root = get_project_root()
    expected = os.path.abspath(os.path.normpath(os.path.join(root, "models")))

    old_cwd = os.getcwd()
    try:
        os.chdir(root)
        resolved = resolve_model_cache_dir("./models")
        assert resolved == expected, f"Esperado {expected}, obtido {resolved}"
    finally:
        os.chdir(old_cwd)


def test_02_cache_dir_resolution_from_backend_directory():
    """2: STT_MODEL_CACHE_DIR=./models a partir de backend/ resolve para <raiz>/models e NUNOF para backend/models."""
    root = get_project_root()
    backend_dir = os.path.join(root, "backend")
    expected = os.path.abspath(os.path.normpath(os.path.join(root, "models")))
    forbidden = os.path.abspath(os.path.normpath(os.path.join(backend_dir, "models")))

    old_cwd = os.getcwd()
    try:
        os.chdir(backend_dir)
        resolved = resolve_model_cache_dir("./models")
        assert resolved == expected, f"Deveria resolver para a raiz: {expected}, obtido: {resolved}"
        assert resolved != forbidden, "Não pode resolver para backend/models!"
    finally:
        os.chdir(old_cwd)


# ---------------------------------------------------------------------------
# 3 & 4. Preservação de Caminhos Absolutos e Expansão de ~
# ---------------------------------------------------------------------------

def test_03_cache_dir_resolution_preserves_absolute_paths():
    """3: Caminhos absolutos existentes são preservados sem prefixar raiz."""
    if sys.platform == "win32":
        custom_abs = "C:\\opt\\custom_models_cache"
    else:
        custom_abs = "/opt/custom_models_cache"

    resolved = resolve_model_cache_dir(custom_abs)
    assert resolved == os.path.abspath(os.path.normpath(custom_abs))


def test_04_cache_dir_resolution_expands_tilde():
    """4: Caminhos iniciando com ~ expandem para o diretório de usuário."""
    raw_tilde = "~/proton_stt_cache"
    expected = os.path.abspath(os.path.normpath(os.path.expanduser(raw_tilde)))

    resolved = resolve_model_cache_dir(raw_tilde)
    assert resolved == expected
    assert "~" not in resolved


# ---------------------------------------------------------------------------
# 5. Comportamento com Dependência Ausente (dependency_missing)
# ---------------------------------------------------------------------------

def test_05_stt_dependency_missing_handling():
    """5: Com dependência ausente, STTService reporta dependency_missing e não quebra a API."""
    stt = STTService()
    stt._dependency_checked = True
    stt._dependency_available = False
    stt._load_error = "dependency_missing: No module named 'faster_whisper'"

    assert stt.is_available() is False
    assert stt.get_unavailable_reason() == "dependency_missing"

    status = stt.get_status()
    assert status["available"] is False
    assert status["ready"] is False
    assert status["unavailable_reason"] == "dependency_missing"


# ---------------------------------------------------------------------------
# 6. Comportamento com Modelo Ausente (model_missing)
# ---------------------------------------------------------------------------

def test_06_stt_model_missing_handling():
    """6: Se diretório de cache não contém o modelo, reporta model_missing sem baixar via rede dinamicamente."""
    with tempfile.TemporaryDirectory() as empty_dir:
        stt = STTService(model_cache_dir=empty_dir)
        stt._dependency_checked = True
        stt._dependency_available = True
        stt._load_error = None

        assert stt.is_model_cached() is False
        assert stt.is_available() is False
        assert stt.get_unavailable_reason() == "model_missing"

        status = stt.get_status()
        assert status["model_cached"] is False
        assert status["ready"] is False
        assert status["unavailable_reason"] == "model_missing"


# ---------------------------------------------------------------------------
# 7. Comportamento com Modelo Presente e Carregável (ready=True)
# ---------------------------------------------------------------------------

def test_07_stt_model_present_and_ready():
    """7: Com modelo presente e carregado, is_available=True e ready=True sem erros."""
    stt = STTService()
    mock_model = MockWhisperModel("Alinhamento semanal")
    stt.set_mock_model(mock_model)

    assert stt.is_available() is True
    assert stt.get_unavailable_reason() is None

    status = stt.get_status()
    assert status["available"] is True
    assert status["ready"] is True
    assert status["unavailable_reason"] is None


# ---------------------------------------------------------------------------
# 8. Falha Real de Carregamento (model_load_error) com Registro Detalhado
# ---------------------------------------------------------------------------

def test_08_stt_model_load_error_logged_and_reported():
    """8: Falha real ao carregar pesos é registrada com detalhe técnico em error_detail e model_load_error."""
    stt = STTService()
    stt._dependency_checked = True
    stt._dependency_available = True
    stt._load_error = "model_load_error: Arquivo de modelo corrompido ou inacessível no cache local"

    assert stt.is_available() is False
    assert stt.get_unavailable_reason() == "model_load_error"

    status = stt.get_status()
    assert status["available"] is False
    assert status["ready"] is False
    assert status["unavailable_reason"] == "model_load_error"
    assert "corrompido" in status["error_detail"]


# ---------------------------------------------------------------------------
# 9. Fallback Seguro de CUDA para CPU INT8
# ---------------------------------------------------------------------------

def test_09_cuda_fallback_to_cpu_int8():
    """9: Falha em tempo de execução de CUDA aciona fallback gracioso para CPU int8."""
    stt = STTService(device="cuda", compute_type="float16")
    stt._dependency_checked = True
    stt._dependency_available = True
    # Força is_model_cached = True
    stt.is_model_cached = lambda: True

    cpu_mock_instance = MockWhisperModel("Transcrição CPU int8 fallback")

    def mock_whisper_init(model_size, device="cpu", compute_type="default", download_root=None, local_files_only=True):
        if device == "cuda":
            raise RuntimeError("CUDA device out of memory ou GPU incompatível")
        return cpu_mock_instance

    with patch("faster_whisper.WhisperModel", side_effect=mock_whisper_init):
        loaded_model = stt._get_or_load_model()
        assert loaded_model is cpu_mock_instance
        assert stt.device == "cpu"
        assert stt.compute_type == "int8"
        assert "fallback" in stt.hardware_profile


# ---------------------------------------------------------------------------
# 10. Áudio em Silêncio: Não Alucinar Texto
# ---------------------------------------------------------------------------

def test_10_silent_audio_produces_no_hallucinations():
    """10: Áudio em silêncio retorna texto vazio ou sem_fala sem inventar fatos ou tarefas."""
    stt = STTService()
    stt.set_mock_model(MockWhisperModel(""))

    silent_wav = _generate_wav_bytes(duration_sec=0.2, amplitude=0)
    result = stt.transcribe_audio_bytes(silent_wav, filename_hint="silence.wav")

    assert result["text"] == ""
    assert result["words_count"] == 0
    assert result["signal_quality"] == "sem_fala"


# ---------------------------------------------------------------------------
# 11. Inferência com Áudio PCM WAV
# ---------------------------------------------------------------------------

def test_11_inference_with_pcm_wav():
    """11: Transcrição de áudio PCM WAV retorna estrutura completa com texto, duração e RTF."""
    stt = STTService()
    expected_text = "Reunião de alinhamento Proton Flow"
    stt.set_mock_model(MockWhisperModel(expected_text))

    pcm_wav = _generate_wav_bytes(duration_sec=0.3, amplitude=9000)
    res = stt.transcribe_audio_bytes(pcm_wav, filename_hint="chunk_pcm.wav")

    assert res["text"] == expected_text
    assert "segments" in res
    assert res["duration"] > 0
    assert "rtf" in res
    assert res["signal_quality"] in ("suficiente", "baixo")


# ---------------------------------------------------------------------------
# 12. Inferência com Áudio WebM/Opus e Montagem de Cabeçalho
# ---------------------------------------------------------------------------

def test_12_webm_streaming_header_assembly():
    """12: Chunks subsequentes WebM recebem o cabeçalho EBML da sessão preservando streaming contínuo."""
    stt = STTService()
    stt.set_mock_model(MockWhisperModel("Transcrição de stream WebM"))

    ebml_header = b"\x1a\x45\xdf\xa3\x01\x00\x00\x00"
    cluster = b"\x1f\x43\xb6\x75"
    chunk_0 = ebml_header + b"init_stream_data" + cluster + b"audio_payload_0"
    chunk_1 = cluster + b"audio_payload_1"
    session_id = "test_sess_webm_12"

    res0 = stt.transcribe_audio_bytes(chunk_0, filename_hint="c0.webm", session_id=session_id, sequence=0)
    assert session_id in stt._session_headers
    assert stt._session_headers[session_id] == ebml_header + b"init_stream_data"

    res1 = stt.transcribe_audio_bytes(chunk_1, filename_hint="c1.webm", session_id=session_id, sequence=1)
    assert res1["status"] != "error" if "status" in res1 else True

    stt.clear_session(session_id)
    assert session_id not in stt._session_headers


# ---------------------------------------------------------------------------
# 13. Idempotência de Chunks Repetidos
# ---------------------------------------------------------------------------

def test_13_idempotency_of_repeated_chunks():
    """13: Envio repetido de mesmo (session_id, sequence) não duplica transcrição nem distorce texto."""
    repo = MeetingRepository()
    live_id = "test_meeting_idemp_13"

    # Cria ou garante reunião no repositório
    repo.save_meeting({
        "ID_MEETING": live_id,
        "TITULO": "Reunião de Teste Idempotência",
        "ORIGEM": "live",
        "STATUS_MEETING": "ao_vivo",
        "ANON_TRANSCRICAO": "",
        "TRANSCRIPT_RAW": "",
        "CHUNKS_PROCESSADOS": {}
    })

    sess_id = "sess_repeat"
    seq = 1
    chunk_text = "Primeiro envio do chunk de teste"

    rec1 = repo.record_live_audio_chunk(
        meeting_id=live_id,
        session_id=sess_id,
        sequence=seq,
        text=chunk_text,
        duration=2.0
    )
    assert rec1 is not None
    assert rec1["transcript"] == chunk_text

    # Segundo envio com a mesma sequence e session_id
    rec2 = repo.record_live_audio_chunk(
        meeting_id=live_id,
        session_id=sess_id,
        sequence=seq,
        text=chunk_text,
        duration=2.0
    )
    # Não pode duplicar
    assert rec2["transcript"] == chunk_text

    meeting = repo.get_by_id(live_id)
    chunks = meeting.get("CHUNKS_PROCESSADOS", {})
    assert len(chunks) == 1
    assert f"{sess_id}:{seq}" in chunks


# ---------------------------------------------------------------------------
# 14. Zero Retenção de Arquivos Temporários após Transcrição ou Erro
# ---------------------------------------------------------------------------

def test_14_zero_temp_files_retention_on_success_and_error():
    """14: Nenhum arquivo pf_chunk_* permanece no disco temporário tanto em sucesso quanto em exceção."""
    stt = STTService()
    temp_dir = tempfile.gettempdir()
    stt.temp_dir = temp_dir

    stt.set_mock_model(MockWhisperModel("Sucesso temp cleanup"))
    wav = _generate_wav_bytes(duration_sec=0.1)

    initial_chunks = set(f for f in os.listdir(temp_dir) if f.startswith("pf_chunk_"))

    # 1. Execução com sucesso
    stt.transcribe_audio_bytes(wav, filename_hint="cleanup_success.wav")
    after_success = set(f for f in os.listdir(temp_dir) if f.startswith("pf_chunk_"))
    assert after_success == initial_chunks, "Arquivo temporário não foi removido após transcrição com sucesso!"

    # 2. Execução com erro no modelo
    error_model = MagicMock()
    error_model.transcribe.side_effect = RuntimeError("Erro simulado durante inferência")
    stt.set_mock_model(error_model)

    try:
        stt.transcribe_audio_bytes(wav, filename_hint="cleanup_fail.wav")
    except Exception:
        pass

    after_error = set(f for f in os.listdir(temp_dir) if f.startswith("pf_chunk_"))
    assert after_error == initial_chunks, "Arquivo temporário não foi removido após exceção na transcrição!"


# ---------------------------------------------------------------------------
# 15. Isolamento Estrito entre Duas Reuniões Simultâneas
# ---------------------------------------------------------------------------

def test_15_concurrency_isolation_two_meetings_same_time():
    """15: Duas reuniões simultâneas processando chunks no mesmo segundo operam com locks e sessões isoladas."""
    stt = STTService()
    stt.set_mock_model(MockWhisperModel("Alinhamento de equipe"))

    wav = _generate_wav_bytes(duration_sec=0.2)
    results = {}
    errors = []

    def transcribe_worker(m_id: str, s_id: str, context: str):
        try:
            res = stt.transcribe_audio_bytes(
                wav,
                filename_hint=f"chunk_{m_id}.wav",
                meeting_id=m_id,
                session_id=s_id,
                sequence=1,
                meeting_context=context
            )
            results[m_id] = res
        except Exception as e:
            errors.append(e)

    t1 = threading.Thread(target=transcribe_worker, args=("reuniao_rh_1020", "sess_rh", "Alinhamento RH folha"))
    t2 = threading.Thread(target=transcribe_worker, args=("reuniao_ti_1020", "sess_ti", "Deploy Kubernetes TI"))

    t1.start()
    t2.start()
    t1.join(timeout=10.0)
    t2.join(timeout=10.0)

    assert len(errors) == 0, f"Erros durante execução concorrente: {errors}"
    assert "reuniao_rh_1020" in results
    assert "reuniao_ti_1020" in results
    assert results["reuniao_rh_1020"]["meeting_id"] == "reuniao_rh_1020"
    assert results["reuniao_ti_1020"]["meeting_id"] == "reuniao_ti_1020"


# ---------------------------------------------------------------------------
# 16. Resposta HTTP 503 Estruturada quando STT Desabilitado ou Indisponível
# ---------------------------------------------------------------------------

def test_16_http_503_when_stt_unavailable():
    """16: Requisição HTTP de chunk retorna status 503 com payload estruturado e mensagem amigável quando STT indisponível."""
    client = TestClient(app)
    repo = MeetingRepository()
    test_id = "test_meeting_http_503"

    repo.save_meeting({
        "ID_MEETING": test_id,
        "TITULO": "Reunião de Teste 503",
        "ORIGEM": "live",
        "STATUS_MEETING": "ao_vivo",
        "ANON_TRANSCRICAO": ""
    })

    stt = get_stt_service()
    with patch.object(stt, "is_available", return_value=False), \
         patch.object(stt, "get_unavailable_reason", return_value="model_missing"):
        
        response = client.post(
            f"/api/live/meetings/{test_id}/transcript/audio",
            data={
                "session_id": "sess_503",
                "sequence": 1,
                "is_final": "false",
                "language": "pt"
            },
            files={"audio": ("chunk.wav", b"dummy_audio_bytes", "audio/wav")}
        )

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unavailable"
        assert data["reason"] == "model_missing"
        assert "fallback do navegador" in data["message"]


# ---------------------------------------------------------------------------
# 17. Reconstrução de Chunks WebM Contínuos via Header de Sessão
# ---------------------------------------------------------------------------

def test_17_webm_header_caching_and_subsequent_chunks_reconstruction():
    """17: Chunk 0 armazena header EBML e Chunk 1+ recebe o header para decodificação contínua."""
    stt = STTService()
    session_id = "test_webm_sess_999"

    # Simula header WebM EBML com tag \x1a\x45\xdf\xa3 seguido de cluster
    ebml_header = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01" + b"\x00" * 40
    cluster_chunk_0 = b"\x1f\x43\xb6\x75" + b"\x01" * 60
    chunk_0_bytes = ebml_header + cluster_chunk_0

    # Chunk 1 tem apenas payload de cluster contínuo (sem header EBML)
    chunk_1_raw = b"\x1f\x43\xb6\x75" + b"\x02" * 80

    mock_model = MockWhisperModel("Alinhamento contínuo de áudio")
    stt.set_mock_model(mock_model)

    # Executa transcrição de chunk 0
    res_0 = stt.transcribe_audio_bytes(
        audio_bytes=chunk_0_bytes,
        filename_hint="chunk_0.webm",
        session_id=session_id,
        sequence=0,
        meeting_id="meeting_multi_chunk"
    )
    assert res_0 is not None
    assert session_id in stt._session_headers
    assert stt._session_headers[session_id] == ebml_header

    # Executa transcrição de chunk 1
    res_1 = stt.transcribe_audio_bytes(
        audio_bytes=chunk_1_raw,
        filename_hint="chunk_1.webm",
        session_id=session_id,
        sequence=1,
        meeting_id="meeting_multi_chunk"
    )
    assert res_1 is not None
    assert res_1["text"] == "Alinhamento contínuo de áudio"


# ---------------------------------------------------------------------------
# 18. Resposta HTTP 200 Estruturada com RTF e Métricas de Processamento
# ---------------------------------------------------------------------------

def test_18_http_upload_chunk_success_structured_response():
    """18: Upload de chunk com sucesso retorna JSON estruturado com status success, timing e rtf."""
    client = TestClient(app)
    repo = MeetingRepository()
    test_id = "test_meeting_http_200_structured"

    repo.save_meeting({
        "ID_MEETING": test_id,
        "TITULO": "Reunião de Teste 200 Estruturada",
        "ORIGEM": "live",
        "STATUS_MEETING": "ao_vivo",
        "ANON_TRANSCRICAO": ""
    })

    stt = get_stt_service()
    mock_model = MockWhisperModel("Discussão sobre metas trimestrais")
    stt.set_mock_model(mock_model)

    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)
    wav_bytes = buf.getvalue()

    response = client.post(
        f"/api/live/meetings/{test_id}/transcript/audio",
        data={
            "session_id": "sess_200_struct",
            "sequence": 0,
            "is_final": "false",
            "language": "pt"
        },
        files={"audio": ("chunk.wav", wav_bytes, "audio/wav")}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["sequence"] == 0
    assert "Discussão sobre metas trimestrais" in data["transcript"]
    assert "processing_time_ms" in data
    assert "rtf" in data
    assert "signal_quality" in data

