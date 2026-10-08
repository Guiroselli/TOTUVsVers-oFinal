"""
Serviço isolado e resiliente de transcrição Speech-to-Text (STT) para o Proton Flow.
Suporta integração nativa com faster-whisper, processamento assíncrono de chunks de áudio,
VAD (Voice Activity Detection), controle de concorrência e inicialização graciosa caso a
dependência opcional não esteja instalada no ambiente.
"""

import os
import time
import tempfile
import logging
import threading
import asyncio
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger("stt_service")

# Variáveis de ambiente configuráveis (PARTE 2)
STT_PROVIDER = os.getenv("STT_PROVIDER", "faster_whisper")
STT_MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "base")
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "pt")
STT_BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "1"))
STT_VAD_FILTER = os.getenv("STT_VAD_FILTER", "true").lower() in ("true", "1", "yes")
STT_CHUNK_SECONDS = int(os.getenv("STT_CHUNK_SECONDS", "4"))
STT_MAX_CHUNK_BYTES = int(os.getenv("STT_MAX_CHUNK_BYTES", str(10 * 1024 * 1024)))  # 10 MB
STT_TEMP_DIR = os.getenv("STT_TEMP_DIR", tempfile.gettempdir())
STT_ENABLED = os.getenv("STT_ENABLED", "true").lower() in ("true", "1", "yes")
STT_MAX_CONCURRENT_TRANSCRIBES = int(os.getenv("STT_MAX_CONCURRENT_TRANSCRIBES", "3"))


class STTService:
    """
    Gerenciador thread-safe de Speech-to-Text com faster-whisper.
    Garante ausência de vazamento de arquivos temporários, limite de concorrência e
    degradação graciosa caso faster-whisper não esteja instalado.
    """

    def __init__(
        self,
        provider: str = STT_PROVIDER,
        model_size: str = STT_MODEL_SIZE,
        device: str = STT_DEVICE,
        compute_type: str = STT_COMPUTE_TYPE,
        language: str = STT_LANGUAGE,
        beam_size: int = STT_BEAM_SIZE,
        vad_filter: bool = STT_VAD_FILTER,
        max_chunk_bytes: int = STT_MAX_CHUNK_BYTES,
        temp_dir: str = STT_TEMP_DIR,
        enabled: bool = STT_ENABLED,
        max_concurrent: int = STT_MAX_CONCURRENT_TRANSCRIBES,
    ):
        self.provider = provider
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language
        self.beam_size = beam_size
        self.vad_filter = vad_filter
        self.max_chunk_bytes = max_chunk_bytes
        self.temp_dir = temp_dir
        self.enabled = enabled
        self.max_concurrent = max_concurrent

        self._model = None
        self._mock_model = None
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(self.max_concurrent)
        self._dependency_checked = False
        self._dependency_available = False
        self._load_error = None
        self._session_headers: Dict[str, bytes] = {}
        self._session_headers_lock = threading.Lock()

    def check_dependency(self) -> bool:
        """Verifica se a biblioteca faster-whisper está instalada sem bloquear startup."""
        if self._mock_model is not None:
            return True
        if not self._dependency_checked:
            try:
                import faster_whisper  # noqa: F401
                self._dependency_available = True
            except (ImportError, ModuleNotFoundError) as err:
                self._dependency_available = False
                self._load_error = f"dependency_missing: {err}"
            except Exception as ex:
                self._dependency_available = False
                self._load_error = f"import_error: {ex}"
            self._dependency_checked = True
        return self._dependency_available

    def is_available(self) -> bool:
        """Informa se o serviço está habilitado e a dependência está pronta para uso."""
        if not self.enabled:
            return False
        return self.check_dependency()

    def get_unavailable_reason(self) -> Optional[str]:
        if not self.enabled:
            return "stt_disabled"
        if not self.check_dependency():
            return "dependency_missing"
        if self._load_error:
            return "model_load_error"
        return None

    def set_mock_model(self, mock_model: Any):
        """Permite injeção de mock de modelo para testes sem baixar pesos de rede."""
        self._mock_model = mock_model
        self._dependency_checked = True
        self._dependency_available = True

    def _get_or_load_model(self):
        """Carregamento lazy e thread-safe do modelo WhisperModel."""
        if self._mock_model is not None:
            return self._mock_model

        if not self.is_available():
            raise RuntimeError(f"STT indisponível: {self.get_unavailable_reason()}")

        with self._lock:
            if self._model is not None:
                return self._model

            try:
                from faster_whisper import WhisperModel
                logger.info(
                    f"Carregando faster-whisper (model={self.model_size}, device={self.device}, compute_type={self.compute_type})..."
                )
                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type
                )
                logger.info("Modelo faster-whisper carregado com sucesso.")
                return self._model
            except Exception as err:
                self._load_error = str(err)
                logger.error(f"Falha ao carregar modelo faster-whisper: {err}")
                raise RuntimeError(f"Erro ao inicializar faster-whisper: {err}")

    def get_status(self) -> Dict[str, Any]:
        """Retorna metadados de status para consumo do frontend (PARTE 4)."""
        available = self.is_available()
        return {
            "enabled": self.enabled,
            "available": available,
            "provider": self.provider,
            "model": self.model_size,
            "device": self.device,
            "language": self.language,
            "reason": self.get_unavailable_reason() if not available else None
        }

    def transcribe_audio_bytes(
        self,
        audio_bytes: bytes,
        filename_hint: str = "chunk.webm",
        language: Optional[str] = None,
        session_id: Optional[str] = None,
        sequence: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Transcreve bytes de áudio com criação e destruição estrita de arquivo temporário (PARTE 3, 9, 10).
        """
        if not self.is_available():
            raise RuntimeError(f"STT indisponível no servidor: {self.get_unavailable_reason()}")

        if not audio_bytes or len(audio_bytes) == 0:
            return {
                "text": "",
                "language": language or self.language,
                "language_probability": 0.0,
                "duration": 0.0,
                "segments": [],
                "processing_time_ms": 0.0,
                "provider": self.provider,
                "model": self.model_size,
                "session_id": session_id,
                "sequence": sequence,
                "is_final": False,
            }

        if len(audio_bytes) > self.max_chunk_bytes:
            raise ValueError(f"Tamanho do chunk excede o limite máximo de {self.max_chunk_bytes} bytes.")

        # Limite de concorrência via Semaphore com timeout de 20s
        acquired = self._semaphore.acquire(timeout=20.0)
        if not acquired:
            raise TimeoutError("Servidor ocupado: limite de transcrições concorrentes atingido. Tente novamente.")

        # Determina extensão temporária
        _, ext = os.path.splitext(filename_hint)
        if not ext:
            ext = ".webm"
        if not ext.startswith("."):
            ext = f".{ext}"

        # Suporte a chunks WebM streaming (MediaRecorder timeslice)
        # Chunk 0 contém o cabeçalho EBML/Tracks do container WebM.
        # Chunks 1+ contêm apenas Clusters brutos e necessitam do cabeçalho do container para decodificação pelo PyAV/Whisper.
        EBML_MAGIC = b"\x1a\x45\xdf\xa3"
        CLUSTER_MAGIC = b"\x1f\x43\xb6\x75"

        if session_id:
            with self._session_headers_lock:
                if audio_bytes.startswith(EBML_MAGIC):
                    cluster_idx = audio_bytes.find(CLUSTER_MAGIC)
                    if cluster_idx > 0:
                        self._session_headers[session_id] = audio_bytes[:cluster_idx]
                        if len(self._session_headers) > 200:
                            oldest = next(iter(self._session_headers))
                            del self._session_headers[oldest]
                elif session_id in self._session_headers:
                    # Se o chunk não possui o cabeçalho EBML e não é outro formato independente (WAV/MP3)
                    if not (audio_bytes.startswith(b"RIFF") or audio_bytes.startswith(b"ID3") or audio_bytes.startswith(b"\xff\xfb")):
                        audio_bytes = self._session_headers[session_id] + audio_bytes

        temp_path = None
        t_start = time.perf_counter()

        try:
            os.makedirs(self.temp_dir, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                delete=False,
                dir=self.temp_dir,
                prefix="pf_chunk_",
                suffix=ext
            ) as tmp:
                tmp.write(audio_bytes)
                temp_path = tmp.name

            model = self._get_or_load_model()
            lang = language or self.language

            # Chamada de transcrição
            segments_gen, info = model.transcribe(
                temp_path,
                language=lang,
                beam_size=self.beam_size,
                vad_filter=self.vad_filter
            )

            segments_list = []
            text_parts = []
            for seg in segments_gen:
                seg_text = getattr(seg, "text", "")
                if seg_text:
                    clean = seg_text.strip()
                    if clean:
                        text_parts.append(clean)
                        segments_list.append({
                            "start": getattr(seg, "start", 0.0),
                            "end": getattr(seg, "end", 0.0),
                            "text": clean
                        })

            full_text = " ".join(text_parts).strip()
            elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)

            return {
                "text": full_text,
                "language": getattr(info, "language", lang) if info else lang,
                "language_probability": getattr(info, "language_probability", 1.0) if info else 1.0,
                "duration": getattr(info, "duration", 0.0) if info else 0.0,
                "segments": segments_list,
                "processing_time_ms": elapsed_ms,
                "provider": self.provider,
                "model": self.model_size,
                "session_id": session_id,
                "sequence": sequence,
                "is_final": False,
            }
        finally:
            self._semaphore.release()
            # Política de retenção zero de áudio temporário (PARTE 9)
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as clean_err:
                    logger.warning(f"Não foi possível remover arquivo temporário de áudio {temp_path}: {clean_err}")

    async def transcribe_audio_async(
        self,
        audio_bytes: bytes,
        filename_hint: str = "chunk.webm",
        language: Optional[str] = None,
        session_id: Optional[str] = None,
        sequence: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Executa a transcrição em thread pool separada sem bloquear o loop asyncio (PARTE 10)."""
        return await asyncio.to_thread(
            self.transcribe_audio_bytes,
            audio_bytes=audio_bytes,
            filename_hint=filename_hint,
            language=language,
            session_id=session_id,
            sequence=sequence,
        )

    def clear_session(self, session_id: str):
        """Remove cabeçalho em cache da sessão para liberação segura de recursos."""
        with self._session_headers_lock:
            self._session_headers.pop(session_id, None)


# Singleton do serviço
_stt_service_instance: Optional[STTService] = None
_stt_service_lock = threading.Lock()


def get_stt_service() -> STTService:
    global _stt_service_instance
    if _stt_service_instance is None:
        with _stt_service_lock:
            if _stt_service_instance is None:
                _stt_service_instance = STTService()
    return _stt_service_instance
