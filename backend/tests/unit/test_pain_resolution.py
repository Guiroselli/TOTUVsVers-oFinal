import pytest
from analytics_service import AnalyticsService

def test_pains_lifecycle_tracking():
    meetings = [
        {
            "ID_MEETING": "m1",
            "DT_MEETING": "2026-01-10",
            "NOME_SEGMENTO": "CLI_1",
            "RESUMO_IA": {
                "dores": [{"categoria": "aprovacao_pendente"}],
                "tarefas": [{"tarefa": "Fluxo Fluig", "status": "Concluído"}]
            }
        },
        {
            "ID_MEETING": "m2",
            "DT_MEETING": "2026-02-15",
            "NOME_SEGMENTO": "CLI_2",
            "RESUMO_IA": {
                "dores": [{"categoria": "aprovacao_pendente"}],
                "tarefas": [{"tarefa": "Revisar alçadas", "status": "Não Inicializado"}]
            }
        }
    ]

    res = AnalyticsService.calculate_pains_lifecycle(meetings)
    assert res.total_pains_tracked >= 1
    item = next(i for i in res.items if i.categoria == "aprovacao_pendente")
    assert item.first_seen_date == "2026-01-10"
    assert item.last_seen_date == "2026-02-15"
    assert item.meetings_count == 2
    assert item.affected_clients_count == 2
    assert item.completed_tasks_count == 1
    assert "TOTVS Fluig" in item.associated_totvs_product
