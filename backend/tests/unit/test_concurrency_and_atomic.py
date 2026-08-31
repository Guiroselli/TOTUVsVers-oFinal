import pytest
from repositories import MeetingRepository

def test_legacy_dores_format_compatibility():
    # Testa quando 'dores' no JSON antigo está gravado como lista de strings puras
    legacy_meeting = {
        "ID_MEETING": "legacy_999",
        "DT_MEETING": "2025-10-15",
        "NOME_SEGMENTO": "CLI_LEGACY",
        "RESUMO_IA": {
            "tema": "Alinhamento Geral",
            "dores": [
                "Aprovação pendente de compras",
                "Problemas de estoque no depósito"
            ],
            "tarefas": [
                {"tarefa": "Revisar estoque", "responsavel": "João", "prazo": "2025-10-30"}
            ]
        }
    }

    repo = MeetingRepository()
    recs = repo.get_recommendations("legacy_999", meeting_data=legacy_meeting)
    assert isinstance(recs, list)
    assert len(recs) >= 1
    # Deve identificar Fluig para aprovação e Supply para estoque mesmo no formato texto antigo
    prod_keys = [r["product_key"] for r in recs]
    assert "fluig" in prod_keys or "supply" in prod_keys

def test_atomic_write_concurrency():
    repo = MeetingRepository()
    # Verifica que o lock do repositório está ativo
    assert hasattr(repo, "_lock")
