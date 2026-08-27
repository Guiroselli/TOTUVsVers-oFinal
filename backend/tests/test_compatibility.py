import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from analytics_service import AnalyticsService
from repositories import MeetingRepository


def test_legacy_dores_format_compatibility():
    # Reuniões antigas com "dores" em formato de lista de textos: ["texto1", "texto2"]
    legacy_meetings = [
        {
            "ID_MEETING": "m-legacy-1",
            "DT_MEETING": "2026-01-10",
            "NOME_SEGMENTO": "T27261",
            "NIVEL_URGENCIA": "Média",
            "ANON_TRANSCRICAO": "Texto antigo",
            "RESUMO_IA": {
                "tema": "Acompanhamento Antigo",
                "dores": [
                    "Atraso na entrega dos relatórios",
                    "Falta de aprovação da gerência",
                    "Sistema lento na sincronização"
                ],
                "tarefas": [
                    {"responsavel": "João", "tarefa": "Enviar planilha", "prazo": "amanhã"}
                ]
            }
        }
    ]

    analytics = AnalyticsService.calculate_quarter_analytics(legacy_meetings, "2026-01-01", "2026-03-31")
    assert analytics.meetings["total"] == 1
    assert analytics.meetings["analyzed"] == 1
    
    # As dores em texto simples foram normalizadas automaticamente para as categorias canônicas
    pains = {p.categoria: p for p in analytics.recurring_pains}
    assert "atraso_prazo" in pains or "aprovacao_pendente" in pains or "gargalo_operacional" in pains
    assert analytics.total_actions == 1
