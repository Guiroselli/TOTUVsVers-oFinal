"""
Testes unitários para o diagnóstico fiel de gravações legadas e fallback PyAV/FFmpeg
no módulo backend/recording_jobs.py (PARTE 1).
"""
import os
import shutil
import tempfile
from unittest.mock import patch
import pytest

from recording_jobs import (
    RecordingJobQueue,
    split_audio,
    STATUS_ERROR,
    STATUS_QUEUED,
)


@pytest.fixture
def temp_recordings_dir():
    temp_dir = tempfile.mkdtemp(prefix="test_rec_")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_legacy_recording_without_job_json_loaded_with_faithful_message(temp_recordings_dir):
    """
    Testa que gravações antigas sem job.json:
    1. Carregam com mensagem fiel 'gravação antiga sem metadados; revise antes de reprocessar'.
    2. NÃO atribuem falso erro de FFmpeg.
    3. Usam o nome real do arquivo de gravação (ex: gravacao.webm).
    4. Preservam o arquivo original intacto sem criar job.json falso no disco.
    """
    meeting_id = "test-meeting-123"
    job_id = "job-legacy-456"
    job_dir = os.path.join(temp_recordings_dir, meeting_id, job_id)
    os.makedirs(job_dir, exist_ok=True)
    audio_path = os.path.join(job_dir, "gravacao.webm")

    dummy_content = b"RIFF....WAVEfmt ...."
    with open(audio_path, "wb") as f:
        f.write(dummy_content)

    with patch("recording_jobs.RECORDINGS_DIR", temp_recordings_dir):
        queue = RecordingJobQueue(process_fn=lambda j: None)
        job = queue.get_job(job_id)

        assert job is not None, "Job legado deve ser recuperado em memória"
        assert job["job_id"] == job_id
        assert job["meeting_id"] == meeting_id
        assert job["filename"] == "gravacao.webm"
        assert job["status"] == STATUS_ERROR
        assert job["error"] == "gravação antiga sem metadados; revise antes de reprocessar"
        assert "ffmpeg" not in job["error"].lower(), "Não deve atribuir falsamente erro ao FFmpeg"

        # Arquivo original deve permanecer intacto
        assert os.path.exists(audio_path)
        with open(audio_path, "rb") as f:
            assert f.read() == dummy_content

        # Não deve criar job.json no disco automaticamente
        assert not os.path.exists(os.path.join(job_dir, "job.json"))


def test_split_audio_uses_pyav_when_ffmpeg_is_none():
    """
    Quando find_ffmpeg() retorna None, split_audio deve utilizar PyAV diretamente.
    """
    with patch("recording_jobs.find_ffmpeg", return_value=None), \
         patch("recording_jobs._split_audio_pyav", return_value=["/tmp/seg_00000.wav"]) as mock_pyav:
        segments = split_audio("dummy.webm", "/tmp/out")
        assert segments == ["/tmp/seg_00000.wav"]
        mock_pyav.assert_called_once_with("dummy.webm", "/tmp/out", 30)


def test_split_audio_falls_back_to_pyav_when_ffmpeg_fails():
    """
    Quando FFmpeg falha, split_audio deve tentar o fallback PyAV com sucesso.
    """
    with patch("recording_jobs.find_ffmpeg", return_value="/usr/bin/ffmpeg"), \
         patch("recording_jobs._split_audio_ffmpeg", side_effect=RuntimeError("FFmpeg erro de conversão")), \
         patch("recording_jobs._split_audio_pyav", return_value=["/tmp/seg_00000.wav"]) as mock_pyav:
        segments = split_audio("dummy.webm", "/tmp/out")
        assert segments == ["/tmp/seg_00000.wav"]
        mock_pyav.assert_called_once_with("dummy.webm", "/tmp/out", 30)


def test_split_audio_reports_both_errors_when_ffmpeg_and_pyav_fail():
    """
    Quando FFmpeg e PyAV falham, a exceção deve descrever com precisão a falha de ambos.
    """
    with patch("recording_jobs.find_ffmpeg", return_value="/usr/bin/ffmpeg"), \
         patch("recording_jobs._split_audio_ffmpeg", side_effect=RuntimeError("ffmpeg segmentation fault")), \
         patch("recording_jobs._split_audio_pyav", side_effect=RuntimeError("pyav stream invalid")):
        with pytest.raises(RuntimeError) as exc_info:
            split_audio("corrupt.webm", "/tmp/out")

        err_msg = str(exc_info.value)
        assert "ffmpeg falhou" in err_msg
        assert "PyAV também falhou" in err_msg


def test_split_audio_reports_pyav_error_when_no_ffmpeg():
    """
    Quando FFmpeg não está disponível e PyAV falha, deve relatar com precisão.
    """
    with patch("recording_jobs.find_ffmpeg", return_value=None), \
         patch("recording_jobs._split_audio_pyav", side_effect=RuntimeError("Arquivo corrompido")):
        with pytest.raises(RuntimeError) as exc_info:
            split_audio("corrupt.webm", "/tmp/out")

        err_msg = str(exc_info.value)
        assert "FFmpeg não encontrado no servidor" in err_msg
        assert "PyAV falhou" in err_msg
