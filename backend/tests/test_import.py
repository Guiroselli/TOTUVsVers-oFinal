import pytest
import sys
import os
import tempfile
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from reparse_meetings import parse_meetings


def test_import_all_meetings_without_limit():
    # Cria um CSV sintético com 35 reuniões para garantir que não trunca em 30
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w", encoding="iso-8859-1") as tf_csv:
        csv_path = tf_csv.name
        tf_csv.write("ID_MEETING,DT_MEETING,FORMATO_MEETING,DURACAO,STATUS_MEETING,DURACAO_MEETING,NOME_SEGMENTO,X,Y,Z,ANON_TRANSCRICAO\n")
        for i in range(1, 36):
            tf_csv.write(f'"{1000 + i}","2026-03-15 10:00:00","VIDEO","","COMPLETED","00:45:00","T{i}","","","","[LOCUTOR]: Reunião teste número {i} sobre prazos e entregas."\n')

    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as tf_json:
        json_path = tf_json.name

    try:
        parse_meetings(csv_path=csv_path, output_json=json_path)
        with open(json_path, "r", encoding="utf-8") as f:
            imported = json.load(f)
            
        assert len(imported) == 35  # Importou todas as 35 reuniões, sem limite de 30
        assert imported[0]["DT_MEETING"] == "2026-03-15 10:00:00"
        assert imported[0]["NOME_SEGMENTO"].startswith("T")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)
        if os.path.exists(json_path):
            os.remove(json_path)
