import pytest
from repositories import MeetingRepository

def test_find_duplicate_and_recurring_tasks():
    # Cria reuniões de teste em memória
    meetings = [
        {
            "ID_MEETING": "m101",
            "DT_MEETING": "2026-02-10",
            "NOME_SEGMENTO": "CLI_1",
            "RESUMO_IA": {
                "tarefas": [
                    {"tarefa": "Validar nota fiscal de entrada no sistema", "responsavel": "Carlos Silva", "status": "Não Inicializado"}
                ]
            }
        },
        {
            "ID_MEETING": "m102",
            "DT_MEETING": "2026-02-25",
            "NOME_SEGMENTO": "CLI_1",
            "RESUMO_IA": {
                "tarefas": [
                    {"tarefa": "Validar nota fiscal de entrada no sistema", "responsavel": "Carlos Silva", "status": "Não Inicializado"}
                ]
            }
        }
    ]

    repo = MeetingRepository()
    groups = repo.find_duplicate_and_recurring_tasks(meetings_list=meetings)
    assert len(groups) >= 1
    grp = groups[0]
    assert "Validar nota fiscal" in grp["tarefa_normalizada"] or "validar nota fiscal" in grp["tarefa_normalizada"].lower()
    assert len(grp["ocorrencias"]) == 2
    assert "motivo_similaridade" in grp
    assert grp["reunioes_origem"] == ["m101", "m102"]
