import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from analytics_service import AnalyticsService, get_quarter_dates, is_task_overdue


def test_get_quarter_dates():
    s1, e1, l1 = get_quarter_dates(2026, 1)
    assert s1 == "2026-01-01"
    assert e1 == "2026-03-31"
    assert "1º Trimestre" in l1

    s2, e2, l2 = get_quarter_dates(2026, 2)
    assert s2 == "2026-04-01"
    assert e2 == "2026-06-30"


def test_is_task_overdue():
    t_concluida = {"status": "Concluído", "prazo": "2020-01-01", "prazo_iso": "2020-01-01"}
    assert not is_task_overdue(t_concluida)

    t_vencida_iso = {"status": "Em Andamento", "prazo": "2020-01-01", "prazo_iso": "2020-01-01"}
    assert is_task_overdue(t_vencida_iso)

    t_vencida_texto = {"status": "Não Inicializado", "prazo": "prazo vencido ontem"}
    assert is_task_overdue(t_vencida_texto)

    t_em_dia = {"status": "Em Andamento", "prazo": "2035-12-31", "prazo_iso": "2035-12-31"}
    assert not is_task_overdue(t_em_dia)


def test_calculate_quarter_analytics_topics_single_count_per_meeting():
    # 2 reuniões: na reunião 1, "Financeiro" aparece como tema principal E em 2 tópicos
    # Regra: deve contar EXATAMENTE 1 vez em reunioes_com_tema para essa reunião
    mock_meetings = [
        {
            "ID_MEETING": "m1",
            "DT_MEETING": "2026-02-10",
            "NOME_SEGMENTO": "T27261",
            "NIVEL_URGENCIA": "Alta",
            "ANON_TRANSCRICAO": "Transcrição detalhada sobre orçamento e faturamento.",
            "RESUMO_IA": {
                "tema": "Financeiro e Contas",
                "organizacao_por_temas": [
                    {"tema": "Financeiro", "topicos": ["Faturamento Q1", "Contas a pagar"]},
                    {"tema": "Desenvolvimento", "topicos": ["API de integração"]}
                ],
                "dores": [
                    {"categoria": "aprovacao_pendente", "descricao": "Falta aprovação da diretoria", "trecho": "quem aprova?"}
                ],
                "tarefas": [
                    {"responsavel": "Lucas", "tarefa": "Enviar nota fiscal", "prazo": "2020-01-01", "prazo_iso": "2020-01-01", "status": "Não Inicializado"}
                ]
            }
        },
        {
            "ID_MEETING": "m2",
            "DT_MEETING": "2026-02-15",
            "NOME_SEGMENTO": "T27261",
            "NIVEL_URGENCIA": "Média",
            "ANON_TRANSCRICAO": "Transcrição sobre suporte e atendimento aos clientes.",
            "RESUMO_IA": {
                "tema": "Suporte e Chamados",
                "organizacao_por_temas": [
                    {"tema": "Suporte", "topicos": ["Fila de chamados"]}
                ],
                "dores": [
                    {"categoria": "insatisfacao_cliente", "descricao": "Cliente reclamou do prazo"}
                ],
                "tarefas": []
            }
        }
    ]

    res = AnalyticsService.calculate_quarter_analytics(mock_meetings, "2026-01-01", "2026-03-31")
    
    assert res.meetings["total"] == 2
    assert res.meetings["analyzed"] == 2
    assert res.open_actions == 1
    assert res.overdue_actions == 1

    # Verifica Financeiro
    financeiro_topic = next((t for t in res.top_topics if t.key == "financeiro"), None)
    assert financeiro_topic is not None
    assert financeiro_topic.reunioes_com_tema == 1
    assert financeiro_topic.ocorrencias >= 2  # Total occurrences is higher
    assert financeiro_topic.percentual_reunioes == 50.0  # 1 de 2 reuniões = 50%

    # Verifica Dores
    assert len(res.recurring_pains) >= 2
    aprov_pain = next((p for p in res.recurring_pains if p.categoria == "aprovacao_pendente"), None)
    assert aprov_pain is not None
    assert aprov_pain.reunioes_afetadas == 1
    assert aprov_pain.percentual_reunioes == 50.0


def test_drilldown_meetings():
    mock_meetings = [
        {
            "ID_MEETING": "m100",
            "DT_MEETING": "2026-02-20",
            "NOME_SEGMENTO": "T888",
            "NIVEL_URGENCIA": "Alta",
            "RESUMO_IA": {
                "tema": "Implantação",
                "dores": [
                    {"categoria": "gargalo_operacional", "descricao": "Sistema travando", "trecho": "o sistema está lento e travando"}
                ]
            }
        }
    ]

    drill = AnalyticsService.get_drilldown_meetings(mock_meetings, "pain", "gargalo_operacional")
    assert drill.total == 1
    assert drill.items[0].meeting_id == "m100"
    assert len(drill.items[0].evidencias) >= 1
    assert "sistema está lento" in drill.items[0].evidencias[0]
