import pytest
from analysis_service import SYSTEM_PROMPT_V2, validar_evidencias_contra_transcricao

def test_prompt_injection_guardrails():
    # Prompt deve conter tags delimitadoras estritas
    assert "<system_instructions>" in SYSTEM_PROMPT_V2
    assert "<expected_schema>" in SYSTEM_PROMPT_V2
    assert "DADO NÃO CONFIÁVEL" in SYSTEM_PROMPT_V2
    assert "NUNCA revele credenciais" in SYSTEM_PROMPT_V2

def test_evidence_validation_against_hallucination():
    transcricao = "Carlos disse que precisamos aprovar o contrato até sexta-feira com o diretor."
    
    # Caso 1: Evidência real presente no texto
    raw_resultado = {
        "tarefas": [
            {
                "tarefa": "Aprovar contrato",
                "evidence": "precisamos aprovar o contrato até sexta-feira",
                "confidence": 0.90
            },
            {
                "tarefa": "Comprar servidores no Japão",
                "evidence": "Vamos importar data centers de Tóquio", # Alucinação
                "confidence": 0.85
            }
        ],
        "dores": []
    }

    validado = validar_evidencias_contra_transcricao(raw_resultado, transcricao)
    # Tarefa 1 deve manter alta confiança
    assert validado["tarefas"][0]["confidence"] >= 0.80
    # Tarefa 2 (alucinação) deve ter confiança rebaixada para 0.30
    assert validado["tarefas"][1]["confidence"] == 0.30
