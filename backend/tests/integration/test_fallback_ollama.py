import pytest
from analysis_service import AnalysisService

def test_fallback_ollama_indisponivel():
    # URL inválida para forçar fallback determinístico
    service = AnalysisService(ollama_url="http://localhost:9999/api/generate", timeout_seconds=1)
    transcript = "Temos um problema crítico onde a produção está parada e quem aprova não respondeu."
    result = service.analyze(transcript)
    assert result.tema is not None
    assert result.nivel_urgencia in ["Crítica", "Alta"]
    assert len(result.dores) >= 1
    assert result.analise_metadados.status == "ollama_offline"
