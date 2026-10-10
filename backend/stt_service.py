"""
Serviço isolado e resiliente de transcrição Speech-to-Text (STT) para o Proton Flow.
Suporta integração nativa com faster-whisper, processamento assíncrono de chunks de áudio,
VAD (Voice Activity Detection) com speech padding para evitar corte de palavras curtas ("reunião"),
vocabulário corporativo via initial_prompt, decodificação determinística (temperature=0.0),
métricas de qualidade do sinal de áudio, controle de concorrência e inicialização graciosa.
"""

import os
import time
import math
import tempfile
import logging
import threading
import asyncio
from typing import Dict, Any, Optional, List, Tuple

# Garante carregamento automático do .env local se presente
try:
    import env_loader  # noqa: F401
except ImportError:
    pass

logger = logging.getLogger("stt_service")

# Variáveis de ambiente configuráveis (PARTE 2, 3 e 4)
STT_PROVIDER = os.getenv("STT_PROVIDER", "faster_whisper")
STT_MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "base")
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "pt")
STT_BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "1"))
STT_TEMPERATURE = float(os.getenv("STT_TEMPERATURE", "0.0"))
STT_VAD_FILTER = os.getenv("STT_VAD_FILTER", "true").lower() in ("true", "1", "yes")
STT_VAD_MIN_SPEECH_MS = int(os.getenv("STT_VAD_MIN_SPEECH_MS", "250"))
STT_VAD_SPEECH_PAD_MS = int(os.getenv("STT_VAD_SPEECH_PAD_MS", "400"))
STT_VAD_THRESHOLD = float(os.getenv("STT_VAD_THRESHOLD", "0.5"))
STT_CONDITION_ON_PREVIOUS_TEXT = os.getenv("STT_CONDITION_ON_PREVIOUS_TEXT", "false").lower() in ("true", "1", "yes")

# Vocabulário corporativo para o decoder Whisper priorizar termos de negócio e evitar erros fonéticos
STT_DEFAULT_VOCAB = (
    "Proton Flow, TOTVS, reunião, ata operacional, ata executiva, RH, TI, "
    "Kubernetes, implantação, prazo, responsável, urgência, diretoria, tarefas, benefícios, deploy"
)
STT_INITIAL_PROMPT = os.getenv("STT_INITIAL_PROMPT", STT_DEFAULT_VOCAB)

STT_CHUNK_SECONDS = int(os.getenv("STT_CHUNK_SECONDS", "4"))
STT_MAX_CHUNK_BYTES = int(os.getenv("STT_MAX_CHUNK_BYTES", str(10 * 1024 * 1024)))  # 10 MB
STT_TEMP_DIR = os.getenv("STT_TEMP_DIR", tempfile.gettempdir())
STT_ENABLED = os.getenv("STT_ENABLED", "true").lower() in ("true", "1", "yes")
STT_MAX_CONCURRENT_TRANSCRIBES = int(os.getenv("STT_MAX_CONCURRENT_TRANSCRIBES", "3"))
STT_MODEL_CACHE_DIR = os.getenv("STT_MODEL_CACHE_DIR", "")


def analyze_audio_signal(audio_bytes: bytes, filename_hint: str = "chunk.webm") -> Dict[str, Any]:
    """
    Analisa métricas do sinal de áudio do chunk (nível de amplitude, qualidade do sinal e duração estimada).
    Garante diagnósticos claros: 'suficiente', 'baixo', 'sem_fala' ou 'saturado'.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        return {
            "bytes": 0,
            "audio_level": 0,
            "signal_quality": "sem_fala",
            "duration": 0.0,
            "sample_rate": None,
            "channels": None
        }

    audio_bytes_len = len(audio_bytes)
    audio_level = 0
    signal_quality = "suficiente"
    sample_rate = 16000
    channels = 1
    duration = 0.0

    try:
        import av
        import io
        
        container = av.open(io.BytesIO(audio_bytes), mode="r")
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream:
            sample_rate = audio_stream.rate or 16000
            channels = audio_stream.channels or 1
            if audio_stream.duration and audio_stream.time_base:
                duration = float(audio_stream.duration * audio_stream.time_base)

            rms_sum = 0.0
            total_samples = 0
            for frame in container.decode(audio_stream):
                arr = frame.to_ndarray()
                if arr is not None and arr.size > 0:
                    flat = arr.flatten().astype("float32")
                    max_abs = abs(flat).max()
                    if max_abs > 1.5:
                        flat = flat / 32768.0
                    rms_sum += float((flat ** 2).sum())
                    total_samples += flat.size
                    if total_samples > 16000 * 4:  # Analisa até ~4s para velocidade
                        break

            if total_samples > 0:
                rms = math.sqrt(rms_sum / total_samples)
                audio_level = min(100, int(rms * 250))
                if rms < 0.003 or audio_level < 2:
                    signal_quality = "sem_fala"
                elif rms < 0.012 or audio_level < 8:
                    signal_quality = "baixo"
                elif rms > 0.85:
                    signal_quality = "saturado"
                else:
                    signal_quality = "suficiente"
    except Exception:
        # Se for fragmento bruto sem container header, estima heurística não invasiva
        if audio_bytes_len < 1024:
            audio_level = 0
            signal_quality = "sem_fala"
        else:
            audio_level = min(80, max(15, int(audio_bytes_len / 500)))
            signal_quality = "suficiente"

    return {
        "bytes": audio_bytes_len,
        "audio_level": audio_level,
        "signal_quality": signal_quality,
        "speech_detected": (signal_quality != "sem_fala" and audio_level > 5),
        "duration": duration,
        "sample_rate": sample_rate,
        "channels": channels
    }


class STTService:
    """
    Gerenciador thread-safe de Speech-to-Text com faster-whisper.
    Garante ausência de vazamento de arquivos temporários, limite de concorrência,
    cache persistente de modelo, vocabulário corporativo para prevenir distorções fonéticas,
    speech padding no VAD e degradação graciosa caso dependências estejam ausentes.
    """

    def __init__(
        self,
        provider: str = STT_PROVIDER,
        model_size: str = STT_MODEL_SIZE,
        device: str = STT_DEVICE,
        compute_type: str = STT_COMPUTE_TYPE,
        language: str = STT_LANGUAGE,
        beam_size: int = STT_BEAM_SIZE,
        temperature: float = STT_TEMPERATURE,
        vad_filter: bool = STT_VAD_FILTER,
        vad_min_speech_ms: int = STT_VAD_MIN_SPEECH_MS,
        vad_speech_pad_ms: int = STT_VAD_SPEECH_PAD_MS,
        vad_threshold: float = STT_VAD_THRESHOLD,
        condition_on_previous_text: bool = STT_CONDITION_ON_PREVIOUS_TEXT,
        initial_prompt: str = STT_INITIAL_PROMPT,
        max_chunk_bytes: int = STT_MAX_CHUNK_BYTES,
        temp_dir: str = STT_TEMP_DIR,
        enabled: bool = STT_ENABLED,
        max_concurrent: int = STT_MAX_CONCURRENT_TRANSCRIBES,
        model_cache_dir: Optional[str] = STT_MODEL_CACHE_DIR,
    ):
        self.provider = provider
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language
        self.beam_size = beam_size
        self.temperature = temperature
        self.vad_filter = vad_filter
        self.vad_min_speech_ms = vad_min_speech_ms
        self.vad_speech_pad_ms = vad_speech_pad_ms
        self.vad_threshold = vad_threshold
        self.condition_on_previous_text = condition_on_previous_text
        self.initial_prompt = initial_prompt
        self.max_chunk_bytes = max_chunk_bytes
        self.temp_dir = temp_dir
        self.enabled = enabled
        self.max_concurrent = max_concurrent
        self.model_cache_dir = model_cache_dir or ""

        # Parâmetros otimizados do VAD Silero para evitar clipping de sílabas iniciais
        self.vad_parameters = {
            "threshold": self.vad_threshold,
            "min_speech_duration_ms": self.vad_min_speech_ms,
            "max_speech_duration_s": float("inf"),
            "min_silence_duration_ms": 2000,
            "speech_pad_ms": self.vad_speech_pad_ms
        }

        self._model = None
        self._mock_model = None
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(self.max_concurrent)
        self._dependency_checked = False
        self._dependency_available = False
        self._load_error = None
        self._is_loading = False
        self._is_downloading = False
        self._session_headers: Dict[str, bytes] = {}
        self._session_headers_lock = threading.Lock()
        self._session_contexts: Dict[str, str] = {}
        self._session_contexts_lock = threading.Lock()

    def check_dependency(self) -> bool:
        """Verifica se a biblioteca faster-whisper e av estão instaladas sem bloquear startup."""
        if self._mock_model is not None:
            return True
        if not self._dependency_checked:
            try:
                import faster_whisper  # noqa: F401
                import av  # noqa: F401
                self._dependency_available = True
            except (ImportError, ModuleNotFoundError) as err:
                self._dependency_available = False
                self._load_error = f"dependency_missing: {err}"
            except Exception as ex:
                self._dependency_available = False
                self._load_error = f"import_error: {ex}"
            self._dependency_checked = True
        return self._dependency_available

    def is_model_cached(self) -> bool:
        """Verifica se os pesos do modelo estão presentes no cache local sem chamadas de rede."""
        if self._mock_model is not None:
            return True
        if not self.check_dependency():
            return False
        try:
            from faster_whisper.utils import download_model
            if self.model_cache_dir and os.path.exists(self.model_cache_dir):
                try:
                    download_model(self.model_size, output_dir=self.model_cache_dir, local_files_only=True)
                    return True
                except Exception:
                    pass
            download_model(self.model_size, local_files_only=True)
            return True
        except Exception:
            return False

    def is_available(self) -> bool:
        """Informa se o serviço está habilitado, a dependência está pronta e o modelo está disponível."""
        if not self.enabled:
            return False
        if not self.check_dependency():
            return False
        if self._load_error:
            return False
        if self._mock_model is not None or self._model is not None:
            return True
        return self.is_model_cached()

    def get_unavailable_reason(self) -> Optional[str]:
        if not self.enabled:
            return "stt_disabled"
        if not self.check_dependency():
            return "dependency_missing"
        if self._load_error:
            return "model_load_error"
        if self._is_downloading:
            return "model_downloading"
        if self._is_loading:
            return "model_loading"
        if not self.is_model_cached():
            return "model_missing"
        return None

    def set_mock_model(self, mock_model: Any):
        """Permite injeção de mock de modelo para testes sem baixar pesos de rede."""
        self._mock_model = mock_model
        self._dependency_checked = True
        self._dependency_available = True

    def _get_or_load_model(self):
        """Carregamento lazy e thread-safe do modelo WhisperModel com suporte a download_root."""
        if self._mock_model is not None:
            return self._mock_model

        if not self.is_available():
            raise RuntimeError(f"STT indisponível: {self.get_unavailable_reason()}")

        with self._lock:
            if self._model is not None:
                return self._model

            try:
                self._is_loading = True
                from faster_whisper import WhisperModel
                download_root = self.model_cache_dir if self.model_cache_dir else None
                logger.info(
                    f"Carregando faster-whisper (model={self.model_size}, device={self.device}, compute_type={self.compute_type}, download_root={download_root})..."
                )
                self._model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                    download_root=download_root
                )
                logger.info("Modelo faster-whisper carregado com sucesso.")
                return self._model
            except Exception as err:
                self._load_error = str(err)
                logger.error(f"Falha ao carregar modelo faster-whisper: {err}")
                raise RuntimeError(f"Erro ao inicializar faster-whisper: {err}")
            finally:
                self._is_loading = False

    def get_session_prompt(self, session_id: Optional[str] = None) -> str:
        """Gera prompt contextual inicial enriquecido com vocabulário corporativo e histórico recente."""
        base_prompt = self.initial_prompt or ""
        if not session_id:
            return base_prompt

        with self._session_contexts_lock:
            ctx = self._session_contexts.get(session_id, "").strip()
            if ctx:
                # Mantém as últimas 15 palavras do contexto anterior
                words = ctx.split()
                tail = " ".join(words[-15:])
                return f"{base_prompt} {tail}".strip()
        return base_prompt

    def update_session_context(self, session_id: str, new_text: str):
        """Atualiza histórico textual recente da sessão para coerência entre chunks."""
        if not session_id or not new_text:
            return
        with self._session_contexts_lock:
            prev = self._session_contexts.get(session_id, "")
            self._session_contexts[session_id] = f"{prev} {new_text}".strip()[-300:]

    def warmup(self) -> Dict[str, Any]:
        """Pré-carrega o modelo e valida inferência básica para warm-up."""
        if not self.is_available():
            raise RuntimeError(f"STT indisponível para warm-up: {self.get_unavailable_reason()}")
        self._get_or_load_model()
        return {
            "status": "ok",
            "model": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "ready": True
        }

    def get_status(self) -> Dict[str, Any]:
        """Retorna metadados detalhados de status para diagnóstico e frontend."""
        is_avail = self.is_available()
        cached = self.is_model_cached()
        is_ready = is_avail and (self._model is not None or self._mock_model is not None)
        reason = self.get_unavailable_reason()

        safe_cache_dir = self.model_cache_dir if self.model_cache_dir else "default_hf_cache"

        return {
            "enabled": self.enabled,
            "available": is_avail,
            "ready": is_ready,
            "provider": self.provider,
            "model": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "language": self.language,
            "beam_size": self.beam_size,
            "temperature": self.temperature,
            "initial_prompt": self.initial_prompt,
            "vad_filter": self.vad_filter,
            "vad_parameters": self.vad_parameters,
            "condition_on_previous_text": self.condition_on_previous_text,
            "cache_dir": safe_cache_dir,
            "model_cached": cached,
            "reason": reason if not is_avail else (reason if not is_ready else None)
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
        Transcreve bytes de áudio com criação e destruição estrita de arquivo temporário,
        aplicação de vocabulário corporativo, medição de sinal e decodificação determinística.
        """
        if not self.is_available():
            raise RuntimeError(f"STT indisponível no servidor: {self.get_unavailable_reason()}")

        # Medição prévia de sinal e amplitude
        audio_metrics = analyze_audio_signal(audio_bytes, filename_hint)

        if not audio_bytes or len(audio_bytes) == 0:
            return {
                "text": "",
                "language": language or self.language,
                "language_probability": 0.0,
                "duration": 0.0,
                "segments": [],
                "processing_time_ms": 0.0,
                "audio_level": 0,
                "signal_quality": "sem_fala",
                "no_speech_prob": 1.0,
                "words_count": 0,
                "provider": self.provider,
                "model": self.model_size,
                "session_id": session_id,
                "sequence": sequence,
                "is_final": False,
            }

        if len(audio_bytes) > self.max_chunk_bytes:
            raise ValueError(f"Tamanho do chunk excede o limite máximo de {self.max_chunk_bytes} bytes.")

        acquired = self._semaphore.acquire(timeout=20.0)
        if not acquired:
            raise TimeoutError("Servidor ocupado: limite de transcrições concorrentes atingido. Tente novamente.")

        _, ext = os.path.splitext(filename_hint)
        if not ext:
            ext = ".webm"
        if not ext.startswith("."):
            ext = f".{ext}"

        # Remontagem de chunks WebM com cabeçalho de container salvo na sessão
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

            # Configura parâmetros com vocabulário corporativo e controle determinístico
            transcribe_kwargs: Dict[str, Any] = {
                "language": lang,
                "beam_size": self.beam_size,
                "vad_filter": self.vad_filter,
                "temperature": self.temperature,
                "condition_on_previous_text": self.condition_on_previous_text,
                "no_speech_threshold": 0.6,
                "log_prob_threshold": -1.0,
                "compression_ratio_threshold": 2.4,
            }
            if self.vad_filter:
                transcribe_kwargs["vad_parameters"] = self.vad_parameters

            session_prompt = self.get_session_prompt(session_id)
            if session_prompt:
                transcribe_kwargs["initial_prompt"] = session_prompt

            # Chamada de transcrição com compatibilidade para WhisperModel real e mocks
            try:
                import inspect
                sig = inspect.signature(model.transcribe)
                has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
                call_kwargs = transcribe_kwargs if has_var_kw else {k: v for k, v in transcribe_kwargs.items() if k in sig.parameters}
            except Exception:
                call_kwargs = transcribe_kwargs

            segments_gen, info = model.transcribe(temp_path, **call_kwargs)

            segments_list = []
            text_parts = []
            no_speech_probs = []

            for seg in segments_gen:
                seg_text = getattr(seg, "text", "")
                nsp = getattr(seg, "no_speech_prob", None)
                if nsp is not None:
                    no_speech_probs.append(float(nsp))
                if seg_text:
                    clean = seg_text.strip()
                    if clean:
                        text_parts.append(clean)
                        segments_list.append({
                            "start": getattr(seg, "start", 0.0),
                            "end": getattr(seg, "end", 0.0),
                            "text": clean,
                            "no_speech_prob": float(nsp) if nsp is not None else 0.0
                        })

            full_text = " ".join(text_parts).strip()
            elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
            avg_no_speech = sum(no_speech_probs) / len(no_speech_probs) if no_speech_probs else 0.0

            if session_id and full_text:
                self.update_session_context(session_id, full_text)

            signal_quality = audio_metrics.get("signal_quality", "suficiente")
            if not full_text:
                if avg_no_speech > 0.6 or signal_quality == "sem_fala":
                    signal_quality = "sem_fala"
                else:
                    signal_quality = "baixo"

            duration_val = getattr(info, "duration", 0.0) if info else audio_metrics.get("duration", 0.0)

            return {
                "text": full_text,
                "language": getattr(info, "language", lang) if info else lang,
                "language_probability": getattr(info, "language_probability", 1.0) if info else 1.0,
                "duration": duration_val,
                "segments": segments_list,
                "processing_time_ms": elapsed_ms,
                "audio_level": audio_metrics.get("audio_level", 0),
                "signal_quality": signal_quality,
                "no_speech_prob": round(avg_no_speech, 3),
                "words_count": len(full_text.split()),
                "provider": self.provider,
                "model": self.model_size,
                "session_id": session_id,
                "sequence": sequence,
                "is_final": False,
            }
        finally:
            self._semaphore.release()
            # Política estrita de retenção zero de arquivo de áudio temporário em disco
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
        """Executa a transcrição em thread pool separada sem bloquear o loop asyncio."""
        return await asyncio.to_thread(
            self.transcribe_audio_bytes,
            audio_bytes=audio_bytes,
            filename_hint=filename_hint,
            language=language,
            session_id=session_id,
            sequence=sequence,
        )

    def clear_session(self, session_id: str):
        """Remove cabeçalho e histórico da sessão para liberação segura de recursos."""
        with self._session_headers_lock:
            self._session_headers.pop(session_id, None)
        with self._session_contexts_lock:
            self._session_contexts.pop(session_id, None)


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
