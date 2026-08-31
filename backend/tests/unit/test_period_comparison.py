import pytest
from analytics_service import AnalyticsService

def test_period_comparison_deltas():
    meetings = [
        # Período Base (Q1 2026)
        {
            "ID_MEETING": "m1",
            "DT_MEETING": "2026-02-10",
            "NOME_SEGMENTO": "CLI_RISK",
            "NIVEL_URGENCIA": "Crítica",
            "RESUMO_IA": {
                "tema": "Implantação e Tecnologia",
                "dores": [{"categoria": "gestao_estoque"}]
            }
        },
        # Período Comparado (Q4 2025)
        {
            "ID_MEETING": "m2",
            "DT_MEETING": "2025-11-20",
            "NOME_SEGMENTO": "CLI_RISK",
            "NIVEL_URGENCIA": "Baixa",
            "RESUMO_IA": {
                "tema": "Implantação e Tecnologia",
                "dores": [{"categoria": "documento_faltando"}]
            }
        }
    ]

    comp = AnalyticsService.compare_periods(
        meetings=meetings,
        base_start="2026-01-01",
        base_end="2026-03-31",
        compare_start="2025-10-01",
        compare_end="2025-12-31"
    )

    assert comp.total_meetings_base == 1
    assert comp.total_meetings_compare == 1
    assert "Problemas de Estoque/Logística" in comp.new_pains
    assert "Documento não localizado" in comp.resolved_pains
    assert "CLI_RISK" in comp.clients_entering_risk
