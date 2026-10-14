"""
Fila de transcrição de gravações completas (chamadas online gravadas no navegador
ou arquivos enviados). Processa uma gravação por vez, em segundo plano:
divide o áudio em trechos (usando PyAV nativo ou ffmpeg) -> STT transcreve cada trecho ->
a transcrição é consolidada na reunião -> a reunião é finalizada e a ata é gerada.
"""
import glob
import json
import logging
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("recording_jobs")

ALLOWED_EXTENSIONS = {".webm", ".ogg", ".opus", ".mp3", ".m4a", ".mp4", ".wav", ".aac", ".flac", ".mkv"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
MIN_UPLOAD_BYTES = 2 * 1024
SEGMENT_SECONDS = 30

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
RECORDINGS_DIR = os.environ.get("RECORDINGS_DIR") or os.path.join(_BACKEND_DIR, "recordings")

STATUS_QUEUED = "na_fila"
STATUS_SPLITTING = "preparando_audio"
STATUS_TRANSCRIBING = "transcrevendo"
STATUS_ANALYZING = "gerando_ata"
STATUS_DONE = "concluido"
STATUS_ERROR = "erro"
ACTIVE_STATUSES = {STATUS_QUEUED, STATUS_SPLITTING, STATUS_TRANSCRIBING, STATUS_ANALYZING}


def find_ffmpeg() -> Optional[str]:
    return os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")


def _split_audio_ffmpeg(ffmpeg: str, src_path: str, out_dir: str, segment_seconds: int = SEGMENT_SECONDS) -> List[str]:
    os.makedirs(out_dir, exist_ok=True)
    pattern = os.path.join(out_dir, "seg_%05d.wav")
    cmd = [
        ffmpeg, "-y", "-v", "error", "-i", src_path, "-vn",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        "-f", "segment", "-segment_time", str(segment_seconds), "-reset_timestamps", "1",
        pattern,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg falhou ao converter o áudio: {(proc.stderr or '').strip()[:300]}")
    segments = sorted(glob.glob(os.path.join(out_dir, "seg_*.wav")))
    if not segments:
        raise RuntimeError("O arquivo não contém áudio utilizável.")
    return segments


def _split_audio_pyav(src_path: str, out_dir: str, segment_seconds: int = SEGMENT_SECONDS) -> List[str]:
    """Decodifica e divide qualquer formato suportado pelo PyAV em WAVs 16 kHz mono."""
    import wave
    try:
        import av
    except ImportError as exc:
        raise RuntimeError(
            "Nem ffmpeg nem biblioteca 'av' (PyAV) estão disponíveis no servidor. "
            "Instale ffmpeg ou pyav para processar gravações."
        ) from exc

    os.makedirs(out_dir, exist_ok=True)
    try:
        container = av.open(src_path, mode="r")
    except Exception as exc:
        raise RuntimeError(f"Não foi possível abrir o arquivo de áudio: {exc}") from exc

    audio_streams = [s for s in container.streams if s.type == "audio"]
    if not audio_streams:
        container.close()
        raise RuntimeError("O arquivo não contém fluxo de áudio utilizável.")

    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    samples_per_seg = segment_seconds * 16000
    seg_idx = 0
    current_samples = 0
    current_wave: Optional[wave.Wave_write] = None
    segments: List[str] = []

    def _open_next():
        nonlocal seg_idx, current_samples, current_wave
        seg_file = os.path.join(out_dir, f"seg_{seg_idx:05d}.wav")
        w = wave.open(seg_file, "wb")
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        segments.append(seg_file)
        seg_idx += 1
        current_samples = 0
        current_wave = w

    def _write_frame(r_frame):
        nonlocal current_wave, current_samples
        pcm_bytes = bytes(r_frame.planes[0])
        samples = r_frame.samples
        offset = 0
        while samples > 0:
            if current_wave is None:
                _open_next()
            space = samples_per_seg - current_samples
            take = min(samples, space)
            current_wave.writeframes(pcm_bytes[offset * 2 : (offset + take) * 2])
            current_samples += take
            offset += take
            samples -= take
            if current_samples >= samples_per_seg:
                current_wave.close()
                current_wave = None

    try:
        for frame in container.decode(audio_streams[0]):
            for r_frame in resampler.resample(frame):
                _write_frame(r_frame)
        for r_frame in resampler.resample(None):
            _write_frame(r_frame)
    except Exception as exc:
        if not segments:
            raise RuntimeError(f"Falha ao decodificar áudio com PyAV: {exc}") from exc
        logger.warning("Aviso durante decodificação de áudio: %s", exc)
    finally:
        if current_wave:
            current_wave.close()
        container.close()

    if not segments:
        raise RuntimeError("O arquivo não contém áudio utilizável.")
    return segments


def split_audio(src_path: str, out_dir: str, segment_seconds: int = SEGMENT_SECONDS) -> List[str]:
    """
    Converte para WAV 16 kHz mono e divide em trechos de `segment_seconds`.
    Prioriza ffmpeg do sistema se presente; usa PyAV nativo de forma transparente
    caso ffmpeg não esteja instalado ou falhe.
    """
    ffmpeg = find_ffmpeg()
    if ffmpeg:
        try:
            return _split_audio_ffmpeg(ffmpeg, src_path, out_dir, segment_seconds)
        except Exception as exc:
            logger.warning("Falha com ffmpeg externo (%s), tentando PyAV...", exc)

    return _split_audio_pyav(src_path, out_dir, segment_seconds)


class RecordingJobQueue:
    """Fila sequencial: uma transcrição por vez, em thread de segundo plano."""

    def __init__(self, process_fn: Optional[Callable[[Dict[str, Any]], None]] = None):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
        self._worker: Optional[threading.Thread] = None
        self._process_fn = process_fn or self._process
        self._load_persisted_jobs()

    # ---------- API pública ----------
    def enqueue(self, meeting_id: str, audio_path: str, original_name: str, size_bytes: int) -> Dict[str, Any]:
        job_id = os.path.basename(os.path.dirname(audio_path)) or meeting_id
        job = {
            "job_id": job_id,
            "meeting_id": str(meeting_id),
            "filename": original_name,
            "audio_path": audio_path,
            "size_bytes": size_bytes,
            "status": STATUS_QUEUED,
            "progress": 0.0,
            "segments_total": 0,
            "segments_done": 0,
            "error": None,
            "created_at": datetime.now().isoformat(),
            "finished_at": None,
        }
        with self._lock:
            self._jobs[job["job_id"]] = job
        self._save_job_meta(job)
        self._queue.put(job["job_id"])
        self._ensure_worker()
        return self._public(job)

    def list_jobs(self, meeting_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            jobs = [self._public(j) for j in self._jobs.values()
                    if meeting_id is None or j["meeting_id"] == str(meeting_id)]
        return sorted(jobs, key=lambda j: j["created_at"], reverse=True)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return self._public(job) if job else None

    def has_active(self) -> bool:
        with self._lock:
            return any(j["status"] in ACTIVE_STATUSES for j in self._jobs.values())

    def dismiss_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.pop(job_id, None)
        if not job:
            return False
        audio_path = job.get("audio_path")
        if audio_path:
            meta_path = os.path.join(os.path.dirname(audio_path), "job.json")
            if os.path.exists(meta_path):
                try:
                    os.remove(meta_path)
                except OSError:
                    pass
        return True

    def retry_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            audio_path = job.get("audio_path")
            if not audio_path or not os.path.exists(audio_path):
                raise RuntimeError("Arquivo de áudio original não encontrado para repetição.")
            job["status"] = STATUS_QUEUED
            job["progress"] = 0.0
            job["segments_total"] = 0
            job["segments_done"] = 0
            job["error"] = None
            job["finished_at"] = None
            public_copy = self._public(job)
        self._save_job_meta(job)
        self._queue.put(job_id)
        self._ensure_worker()
        return public_copy

    # ---------- internos ----------
    @staticmethod
    def _public(job: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in job.items() if k != "audio_path"}

    def _save_job_meta(self, job: Dict[str, Any]):
        audio_path = job.get("audio_path")
        if not audio_path:
            return
        job_dir = os.path.dirname(audio_path)
        if os.path.isdir(job_dir):
            try:
                meta_path = os.path.join(job_dir, "job.json")
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(job, f, ensure_ascii=False, indent=2)
            except Exception as exc:
                logger.warning("Falha ao salvar job.json em %s: %s", job_dir, exc)

    def _load_persisted_jobs(self):
        if not os.path.isdir(RECORDINGS_DIR):
            return
        for root, dirs, files in os.walk(RECORDINGS_DIR):
            if "job.json" in files:
                try:
                    meta_path = os.path.join(root, "job.json")
                    with open(meta_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    job_id = data.get("job_id")
                    if job_id and job_id not in self._jobs:
                        self._jobs[job_id] = data
                except Exception:
                    pass
            elif any(f.startswith("gravacao.") for f in files):
                job_id = os.path.basename(root)
                meeting_id = os.path.basename(os.path.dirname(root))
                grav_file = next(f for f in files if f.startswith("gravacao."))
                audio_path = os.path.join(root, grav_file)
                if job_id and job_id not in self._jobs:
                    self._jobs[job_id] = {
                        "job_id": job_id,
                        "meeting_id": meeting_id,
                        "filename": "chamada.webm",
                        "audio_path": audio_path,
                        "size_bytes": os.path.getsize(audio_path),
                        "status": STATUS_ERROR,
                        "progress": 0.0,
                        "segments_total": 0,
                        "segments_done": 0,
                        "error": "ffmpeg não encontrado no servidor. Instale o ffmpeg ou defina FFMPEG_PATH.",
                        "created_at": datetime.now().isoformat(),
                        "finished_at": datetime.now().isoformat(),
                    }

    def _update(self, job: Dict[str, Any], **fields):
        with self._lock:
            job.update(fields)
        self._save_job_meta(job)

    def _ensure_worker(self):
        with self._lock:
            if self._worker and self._worker.is_alive():
                return
            self._worker = threading.Thread(target=self._run, name="recording-worker", daemon=True)
            self._worker.start()

    def _run(self):
        while True:
            try:
                job_id = self._queue.get(timeout=5)
            except queue.Empty:
                return
            with self._lock:
                job = self._jobs.get(job_id)
            if not job:
                continue
            try:
                self._process_fn(job)
                if job["status"] != STATUS_ERROR:
                    self._update(job, status=STATUS_DONE, progress=1.0,
                                 finished_at=datetime.now().isoformat())
            except Exception as err:  # noqa: BLE001
                logger.exception("Falha ao processar gravação %s", job_id)
                self._update(job, status=STATUS_ERROR, error=str(err),
                             finished_at=datetime.now().isoformat())

    def _process(self, job: Dict[str, Any]):
        # Imports tardios: evitam ciclo com routers.meetings e carga pesada no import.
        from stt_service import get_stt_service
        from repositories import MeetingRepository
        from routers import meetings as meetings_router

        repo = MeetingRepository()
        stt = get_stt_service()
        meeting_id = job["meeting_id"]

        if not stt.is_available():
            raise RuntimeError(f"Transcrição indisponível no servidor: {stt.get_unavailable_reason()}")
        meeting = repo.get_by_id(meeting_id)
        if not meeting:
            try:
                meeting = repo.create_live_meeting({
                    "ID_MEETING": str(meeting_id),
                    "titulo": f"Gravação {job.get('filename', 'online')}",
                    "departamento": "Geral",
                    "horario": datetime.now().strftime("%H:%M"),
                    "data": datetime.now().strftime("%Y-%m-%d"),
                    "origem": "live",
                })
            except Exception as exc:
                logger.warning("Falha ao restaurar reunião para gravação %s: %s", meeting_id, exc)
                raise RuntimeError(f"Reunião {meeting_id} não encontrada.") from exc


        self._update(job, status=STATUS_SPLITTING)
        work_dir = tempfile.mkdtemp(prefix="rec_")
        try:
            segments = split_audio(job["audio_path"], work_dir)
            self._update(job, status=STATUS_TRANSCRIBING, segments_total=len(segments))

            session_id = f"rec-{job['job_id']}"
            context = f"{meeting.get('TITULO', '')} {meeting.get('NOME_SEGMENTO', '')} {meeting.get('DEPARTAMENTO', '')}".strip()
            for seq, seg_path in enumerate(segments):
                with open(seg_path, "rb") as fh:
                    audio_bytes = fh.read()
                result = stt.transcribe_audio_bytes(
                    audio_bytes=audio_bytes,
                    filename_hint="chunk.wav",
                    language="pt",
                    session_id=session_id,
                    sequence=seq,
                    meeting_context=context,
                    meeting_id=meeting_id,
                )
                repo.record_live_audio_chunk(
                    meeting_id=meeting_id,
                    session_id=session_id,
                    sequence=seq,
                    text=result.get("text", ""),
                    duration=result.get("duration", 0.0),
                    audio_level=result.get("audio_level", 0),
                    signal_quality=result.get("signal_quality", "suficiente"),
                    no_speech_prob=result.get("no_speech_prob", 0.0),
                    processing_time_ms=result.get("processing_time_ms", 0.0),
                    segments=result.get("segments", []),
                    meeting_context=context,
                    model_name=result.get("model_name"),
                    low_confidence_count=result.get("low_confidence_count", 0),
                    rtf=result.get("rtf", 0.0),
                    is_delayed=result.get("is_delayed", False),
                )
                self._update(job, segments_done=seq + 1, progress=round((seq + 1) / len(segments) * 0.95, 3))
            stt.clear_session(session_id, meeting_id=meeting_id)
            stt.clear_meeting_audio(meeting_id)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

        self._update(job, status=STATUS_ANALYZING)
        repo.update_live_meeting_status(meeting_id, "finalizar", author="recording_job")
        try:
            meetings_router.analyze_existing_meeting(meeting_id, force_reanalyze=True)
        except Exception as err:  # noqa: BLE001
            # A transcrição já está salva; a ata pode ser regerada depois.
            self._update(job, error=f"Transcrição concluída, mas a ata falhou: {err}")


_queue_instance: Optional[RecordingJobQueue] = None
_queue_lock = threading.Lock()


def get_job_queue() -> RecordingJobQueue:
    global _queue_instance
    if _queue_instance is None:
        with _queue_lock:
            if _queue_instance is None:
                _queue_instance = RecordingJobQueue()
    return _queue_instance


def save_upload_path(meeting_id: str, filename: str) -> str:
    """Cria o diretório do job e devolve o caminho onde o arquivo será salvo."""
    ext = os.path.splitext(filename or "")[1].lower() or ".webm"
    job_id = f"{int(time.time())}-{os.urandom(3).hex()}"
    job_dir = os.path.join(RECORDINGS_DIR, str(meeting_id), job_id)
    os.makedirs(job_dir, exist_ok=True)
    return os.path.join(job_dir, f"gravacao{ext}")
