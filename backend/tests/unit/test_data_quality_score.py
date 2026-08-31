import pytest
from analytics_service import AnalyticsService

def test_data_quality_score_empty_dataset():
    res = AnalyticsService.calculate_quarter_analytics([], '2026-01-01', '2026-03-31')
    dq = res.data_quality
    assert dq.total_reunioes == 0
    assert dq.score_qualidade_dados == 100.0
    assert dq.score_qualidade_ia == 100.0
    assert dq.score_qualidade == 100.0
    assert dq.calculation_breakdown is not None
    assert dq.calculation_breakdown['peso_dados_geral'] == 50
    assert dq.calculation_breakdown['peso_ia_geral'] == 50

def test_data_quality_score_known_calculation():
    meetings = [
        {
            'ID_MEETING': 'm1',
            'DT_MEETING': '2026-03-01',
            'NOME_SEGMENTO': 'CLI_101',
            'ANON_TRANSCRICAO': 'Transcricao valida',
            'STATUS_ANALISE': 'analise_concluida',
            'RESUMO_IA': {
                'tema': 'Processos',
                'analise_metadados': {'status': 'success', 'prompt_version': 'v2'},
                'dores': [],
                'tarefas': [
                    {'tarefa': 'Ajustar banco', 'responsavel': 'Carlos', 'prazo': '2026-03-10', 'prazo_iso': '2026-03-10', 'status': 'Concluido'},
                    {'tarefa': 'Treinar time', 'responsavel': 'Mariana', 'prazo': '2026-03-15', 'prazo_iso': '2026-03-15', 'status': 'Nao Inicializado'}
                ]
            }
        },
        {
            'ID_MEETING': 'm2',
            'DT_MEETING': 'Data invalida',
            'NOME_SEGMENTO': 'CLI_102',
            'ANON_TRANSCRICAO': 'Texto da reuniao',
            'STATUS_ANALISE': 'aguardando_analise',
            'RESUMO_IA': None
        }
    ]
    res = AnalyticsService.calculate_quarter_analytics(meetings, '2026-01-01', '2026-03-31')
    dq = res.data_quality
    assert dq.total_reunioes == 2
    assert dq.reunioes_com_transcricao == 2
    assert dq.clientes_identificados == 2
    assert dq.datas_validas == 1
    assert dq.datas_invalidas == 1
    assert dq.reunioes_analisadas == 1
    assert dq.reunioes_sem_analise == 1
    assert dq.tarefas_com_responsavel == 2
    assert dq.tarefas_com_prazo == 2
    assert dq.falhas_ia == 0
    assert dq.score_qualidade_dados == 90.0
    assert dq.score_qualidade_ia == 70.0
    assert dq.score_qualidade == 80.0
    cb = dq.calculation_breakdown
    assert cb['peso_dados_geral'] == 50
    assert cb['peso_ia_geral'] == 50
    assert cb['pesos_dados']['transcricao']['peso'] == 35
    assert cb['pesos_dados']['clientes']['peso'] == 25
    assert cb['pesos_dados']['datas']['peso'] == 20
    assert cb['pesos_dados']['tarefas_responsavel']['peso'] == 10
    assert cb['pesos_dados']['tarefas_prazo']['peso'] == 10
    assert cb['pesos_ia']['analises_concluidas']['peso'] == 60
    assert cb['pesos_ia']['ausencia_falhas']['peso'] == 40

def test_data_quality_score_clamping():
    meetings = [
        {
            'ID_MEETING': 'm1',
            'DT_MEETING': None,
            'NOME_SEGMENTO': 'SERVICOS',
            'ANON_TRANSCRICAO': '',
            'STATUS_ANALISE': 'aguardando_analise',
            'RESUMO_IA': None
        }
    ]
    res = AnalyticsService.calculate_quarter_analytics(meetings, '2026-01-01', '2026-03-31')
    dq = res.data_quality
    assert 0.0 <= dq.score_qualidade_dados <= 100.0
    assert 0.0 <= dq.score_qualidade_ia <= 100.0
    assert 0.0 <= dq.score_qualidade <= 100.0
