import math
import os
import struct
import time
import wave

import pytest

import recording_jobs as rj


def _make_wav(path, seconds):
    rate = 16000
    total_frames = int(rate * seconds)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        # 16-bit PCM wave de 440 Hz
        frames = bytearray()
        for i in range(total_frames):
            val = int(32767.0 * 0.3 * math.sin(2 * math.pi * 440 * i / rate))
            frames.extend(struct.pack("<h", val))
        w.writeframes(frames)


def test_split_audio_divide_em_trechos(tmp_path):
    src = str(tmp_path / "a.wav")
    _make_wav(src, 70)
    segs = rj.split_audio(src, str(tmp_path / "out"), segment_seconds=30)
    assert len(segs) == 3
    assert all(s.endswith(".wav") for s in segs)


def test_split_audio_pyav_direto(tmp_path):
    src = str(tmp_path / "b.wav")
    _make_wav(src, 65)
    segs = rj._split_audio_pyav(src, str(tmp_path / "out_pyav"), segment_seconds=30)
    assert len(segs) == 3
    assert all(s.endswith(".wav") for s in segs)


def test_split_audio_arquivo_invalido(tmp_path):
    bad = tmp_path / "x.webm"
    bad.write_bytes(b"nao e audio" * 500)
    with pytest.raises(RuntimeError):
        rj.split_audio(str(bad), str(tmp_path / "out"))


def test_fila_processa_em_ordem_e_registra_erro(tmp_path):
    order = []

    def fake(job):
        order.append(job["filename"])
        if job["filename"] == "ruim.webm":
            raise RuntimeError("falhou")

    q = rj.RecordingJobQueue(process_fn=fake)
    q.enqueue("m1", str(tmp_path / "j1" / "g.webm"), "ok.webm", 10)
    q.enqueue("m1", str(tmp_path / "j2" / "g.webm"), "ruim.webm", 10)
    for _ in range(50):
        if not q.has_active():
            break
        time.sleep(0.1)
    jobs = {j["filename"]: j for j in q.list_jobs("m1")}
    assert order == ["ok.webm", "ruim.webm"]
    assert jobs["ok.webm"]["status"] == rj.STATUS_DONE
    assert jobs["ruim.webm"]["status"] == rj.STATUS_ERROR
    assert "falhou" in jobs["ruim.webm"]["error"]
    assert "audio_path" not in jobs["ok.webm"]


def test_dismiss_e_retry_job(tmp_path):
    audio_path = str(tmp_path / "rec" / "g.wav")
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    _make_wav(audio_path, 5)

    attempts = 0

    def fail_once(job):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("primeira falha intencional")

    q = rj.RecordingJobQueue(process_fn=fail_once)
    job = q.enqueue("m2", audio_path, "chamada.wav", 1000)
    job_id = job["job_id"]

    for _ in range(50):
        if not q.has_active():
            break
        time.sleep(0.1)

    cur = q.get_job(job_id)
    assert cur["status"] == rj.STATUS_ERROR
    assert "primeira falha intencional" in cur["error"]

    # Retry
    retried = q.retry_job(job_id)
    assert retried["status"] == rj.STATUS_QUEUED
    for _ in range(50):
        if not q.has_active():
            break
        time.sleep(0.1)

    cur2 = q.get_job(job_id)
    assert cur2["status"] == rj.STATUS_DONE
    assert attempts == 2

    # Dismiss
    dismissed = q.dismiss_job(job_id)
    assert dismissed is True
    assert q.get_job(job_id) is None
