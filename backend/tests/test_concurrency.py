import pytest
import sys
import os
import tempfile
import json
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from repositories import MeetingRepository


def test_atomic_concurrent_writes():
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as tf:
        temp_path = tf.name

    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump([], f)

    repo = MeetingRepository(dataset_path=temp_path)

    def worker(worker_id):
        for i in range(15):
            repo.save_meeting({
                "ID_MEETING": f"w_{worker_id}_{i}",
                "DT_MEETING": "2026-03-10",
                "ANON_TRANSCRICAO": f"Transcrição do worker {worker_id} passo {i}",
                "NOME_SEGMENTO": f"T{worker_id}"
            })

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    all_meetings = repo.get_all()
    assert len(all_meetings) == 75

    if os.path.exists(temp_path):
        os.remove(temp_path)
