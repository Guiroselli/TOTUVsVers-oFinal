import os
import subprocess
import time

import pytest

import recording_jobs as rj


def _make_wav(path, seconds):
    ffmpeg = rj.find_ffmpeg()
    if not ffmpeg:
        pytest.skip("ffmpeg indisponível")
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", path], check=True)


def test_split_audio_divide_em_trechos(tmp_path):
    src = str(tmp_path / "a.wav")
    _make_wav(src, 70)
    segs = rj.split_audio(src, str(tmp_path / "out"), segment_seconds=30)
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
