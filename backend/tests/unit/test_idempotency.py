import pytest
from routers.integrations import compute_request_hash
from repositories import IntegrationsRepository

def test_idempotent_hash_generation():
    tarefas = [
        {"tarefa": "Validar nota fiscal", "responsavel": "Ana", "prazo": "2026-03-30"},
        {"tarefa": "Enviar relatório", "responsavel": "Bruno", "prazo": "2026-04-02"}
    ]
    hash1 = compute_request_hash("meeting_123", "protheus", tarefas)
    hash2 = compute_request_hash("meeting_123", "protheus", tarefas)
    
    # Ordem diferente das tarefas não altera o hash determinístico
    tarefas_invertidas = [tarefas[1], tarefas[0]]
    hash3 = compute_request_hash("meeting_123", "protheus", tarefas_invertidas)
    
    assert hash1 == hash2
    assert hash1 == hash3
    assert len(hash1) == 64  # SHA-256 hex length
