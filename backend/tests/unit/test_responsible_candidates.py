import pytest
from analysis_service import identificar_candidatos_responsavel

def test_clear_single_facilitator_candidate():
    transcricao = "[Carlos Silva]: Olá pessoal, eu vou conduzir e liderar esta reunião hoje. Eu abro a pauta e alinho as entregas."
    tarefas = [{"responsavel": "Carlos Silva", "tarefa": "Enviar ata"}]
    nome, conf, evid, candidatos = identificar_candidatos_responsavel(transcricao, tarefas)
    assert nome == "Carlos Silva"
    assert conf >= 0.70
    assert len(candidatos) >= 1

def test_multiple_candidates_ranking():
    transcricao = (
        "[Mariana Lima]: Bem-vindos à reunião de alinhamento. Eu vou facilitar.\n"
        "[Roberto Souza]: Carlos, você pode me mandar a planilha?\n"
        "[Mariana Lima]: Sim, eu fecho o plano de ação."
    )
    tarefas = [
        {"responsavel": "Mariana Lima", "tarefa": "Organizar workshop"},
        {"responsavel": "Roberto Souza", "tarefa": "Revisar código"}
    ]
    nome, conf, evid, candidatos = identificar_candidatos_responsavel(transcricao, tarefas)
    assert nome == "Mariana Lima"
    assert candidatos[0]["name"] == "Mariana Lima"

def test_no_candidate_returns_nao_identificado():
    transcricao = "Tudo bem com vocês? Sim, tudo bem. Ok, vamos conversando então."
    tarefas = []
    nome, conf, evid, candidatos = identificar_candidatos_responsavel(transcricao, tarefas)
    assert nome == "Não identificado"
    assert conf == 0.0
