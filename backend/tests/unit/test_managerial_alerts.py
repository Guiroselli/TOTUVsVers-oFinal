import pytest
from analytics_service import AnalyticsService

def test_11_managerial_alerts_generation():
    meetings = [
        {
            "ID_MEETING": "m1",
            "DT_MEETING": "2026-03-01",
            "NOME_SEGMENTO": "CLIENTE_A",
            "NIVEL_URGENCIA": "Crítica",
            "RESUMO_IA": {
                "tema": "Atrasos e Bloqueios",
                "nivel_urgencia": "Crítica",
                "contexto": {"problema": "Sistema travando", "decisao": "Não mencionado"},
                "dores": [{"categoria": "aprovacao_pendente", "descricao": "Sem aprovação", "trecho": "quem aprova?"}],
                "tarefas": [
                    {"tarefa": "Corrigir bug crítico", "responsavel": "Não identificado", "prazo": "2026-01-01", "prazo_iso": "2026-01-01", "status": "Não Inicializado"}
                ],
                "recomendacoes_totvs": [{"product_key": "fluig", "fit_score": 0.85, "review_status": "pending"}]
            }
        },
        {
            "ID_MEETING": "m2",
            "DT_MEETING": "2026-03-10",
            "NOME_SEGMENTO": "CLIENTE_A",
            "NIVEL_URGENCIA": "Crítica",
            "RESUMO_IA": {
                "tema": "Continuação do Bloqueio",
                "nivel_urgencia": "Crítica",
                "contexto": {"problema": "Sem aprovação", "decisao": "Não mencionado"},
                "dores": [{"categoria": "aprovacao_pendente", "descricao": "Sem aprovação", "trecho": "quem aprova?"}],
                "tarefas": [
                    {"tarefa": "Corrigir bug crítico", "responsavel": "Não identificado", "prazo": "Não mencionado", "status": "Não Inicializado"}
                ]
            }
        },
        {
            "ID_MEETING": "m3",
            "DT_MEETING": "2026-03-15",
            "NOME_SEGMENTO": "CLIENTE_B",
            "RESUMO_IA": {
                "tema": "Terceira reunião com a mesma dor",
                "dores": [{"categoria": "aprovacao_pendente", "descricao": "Sem aprovação", "trecho": "quem aprova?"}],
                "tarefas": []
            }
        }
    ]

    analytics = AnalyticsService.calculate_quarter_analytics(meetings, "2026-01-01", "2026-03-31")
    alert_types = [a.type for a in analytics.managerial_alerts]
    
    assert "dor_recorrente" in alert_types
    assert "tarefa_vencida" in alert_types
    assert "cliente_urgencia_critica" in alert_types
    assert "reuniao_sem_decisao" in alert_types
    assert "tarefa_sem_responsavel" in alert_types
    assert "tarefa_sem_prazo" in alert_types
    assert "recomendacao_pendente" in alert_types
    
    # Valida níveis visuais
    severities = [a.severity for a in analytics.managerial_alerts]
    for s in severities:
        assert s in ["critical", "warning", "info"]
        
    # Primeiro alerta deve ser critical ou warning (mais grave primeiro)
    assert analytics.managerial_alerts[0].severity in ["critical", "warning"]
