import pytest
import sys
import os
import tempfile
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from repositories import MeetingRepository


@pytest.fixture
def temp_repo():
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as tf:
        temp_path = tf.name
        
    initial_data = [
        {
            "ID_MEETING": "m-sug-1",
            "DT_MEETING": "2026-03-20",
            "ANON_TRANSCRICAO": "Discussão de projeto",
            "NOME_SEGMENTO": "T123",
            "NIVEL_URGENCIA": "Média",
            "RESPONSAVEL_REUNIAO": "",
            "field_suggestions": {
                "responsavel_reuniao": {
                    "field_name": "responsavel_reuniao",
                    "suggested_value": "Mariana Santos",
                    "confidence": 0.88,
                    "evidence": "Mariana liderou a apresentação",
                    "review_status": "pending",
                    "confirmed_value": None
                },
                "nivel_urgencia": {
                    "field_name": "nivel_urgencia",
                    "suggested_value": "Alta",
                    "confidence": 0.92,
                    "evidence": "Prazo apertado",
                    "review_status": "pending",
                    "confirmed_value": None
                }
            }
        }
    ]
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(initial_data, f)
        
    repo = MeetingRepository(dataset_path=temp_path)
    yield repo
    
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_confirm_suggestion(temp_repo):
    res = temp_repo.update_suggestion("m-sug-1", "responsavel_reuniao", "confirm")
    assert res["status"] == "success"
    assert res["suggestion"]["review_status"] == "confirmed"
    assert res["suggestion"]["confirmed_value"] == "Mariana Santos"
    
    # Verifica que o campo oficial foi sincronizado
    m = temp_repo.get_by_id("m-sug-1")
    assert m["RESPONSAVEL_REUNIAO"] == "Mariana Santos"


def test_edit_suggestion(temp_repo):
    res = temp_repo.update_suggestion("m-sug-1", "responsavel_reuniao", "edit", custom_value="Roberto Almeida")
    assert res["status"] == "success"
    assert res["suggestion"]["review_status"] == "confirmed"
    assert res["suggestion"]["confirmed_value"] == "Roberto Almeida"
    
    m = temp_repo.get_by_id("m-sug-1")
    assert m["RESPONSAVEL_REUNIAO"] == "Roberto Almeida"


def test_reject_suggestion(temp_repo):
    res = temp_repo.update_suggestion("m-sug-1", "nivel_urgencia", "reject")
    assert res["status"] == "success"
    assert res["suggestion"]["review_status"] == "rejected"
    assert res["suggestion"]["confirmed_value"] is None
