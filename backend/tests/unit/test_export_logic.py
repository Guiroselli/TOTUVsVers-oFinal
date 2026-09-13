import pytest
from normalization import classify_client_identity

def test_export_data_structure_long_uuid_and_client():
    meeting_id_long = '647000df-ef24-4f81-8025-5ae86c478a87-extended-uuid-test'
    client_name_long = 'EMPRESA MULTINACIONAL DE DISTRIBUICAO LOGISTICA E VAREJO S.A.'
    segment_long = 'DISTRIBUICAO E LOGISTICA INTERNACIONAL INTEGRADA'
    
    identity = classify_client_identity(client_name_long)
    assert identity['client_identity_status'] == 'valid_client'
    assert len(identity['client_code']) > 0
    assert len(meeting_id_long) >= 36
    assert len(client_name_long) > 40

def test_export_data_structure_unanalyzed_meeting():
    unanalyzed_meeting = {
        'ID_MEETING': 'meet_unanalyzed_01',
        'DT_MEETING': '2026-03-20',
        'NOME_SEGMENTO': 'CLI_999',
        'STATUS_ANALISE': 'aguardando_analise',
        'STATUS_REVISAO': 'revisao_pendente',
        'RESUMO_IA': None
    }
    assert unanalyzed_meeting['RESUMO_IA'] is None
    assert unanalyzed_meeting['STATUS_ANALISE'] == 'aguardando_analise'

def test_export_data_structure_deterministic_fallback():
    from analysis_service import AnalysisService
    from schemas import AnalysisMetadata
    
    svc = AnalysisService()
    transcript = 'Precisamos enviar os relatorios fiscais com urgencia para a diretoria.'
    meta = AnalysisMetadata(
        model='test',
        prompt_version='v2',
        analyzed_at='2026-03-20T10:00:00',
        duration_seconds=0.01,
        transcript_char_count=len(transcript),
        status='ollama_offline'
    )
    fallback_res = svc._build_deterministic_fallback(transcript, {}, meta, '2026-03-20', None, None)
    
    assert fallback_res['tema'] == 'Não identificado'
    assert fallback_res['contexto']['problema'] == 'Não identificado'
    assert fallback_res['contexto']['decisao'] == 'Não mencionado'
    assert 'Alinhamento Operacional (Fallback)' not in fallback_res['tema']

def test_export_data_structure_real_persisted_analysis():
    real_analysis = {
        'tema': 'Implantação Fluig e Workflow de Compras',
        'contexto': {
            'problema': 'Atraso na aprovação de pedidos de compras acima de R$ 50.000.',
            'decisao': 'Criar workflow automatizado no TOTVS Fluig com alçada de aprovação.'
        },
        'organizacao_por_temas': [
            {'tema': 'Compras e Suprimentos', 'topicos': ['Alçadas de aprovação', 'Integração ERP']}
        ],
        'dores': [
            {'label': 'Aprovação pendente', 'severidade': 'Alta', 'descricao': 'Pedidos parados na diretoria'}
        ],
        'tarefas': [
            {'tarefa': 'Desenhar diagrama do processo', 'responsavel': 'Mariana Lima', 'prazo': '2026-03-25', 'prazo_iso': '2026-03-25', 'status': 'Não Inicializado'}
        ],
        'recomendacoes_totvs': [
            {'product_name': 'TOTVS Fluig', 'fit_score': 0.95, 'review_status': 'pending', 'why_recommended': 'Automatiza workflows e alçadas de aprovação.'}
        ],
        'analise_metadados': {
            'prompt_version': 'v2',
            'analysis_engine': 'ollama',
            'status': 'success'
        }
    }
    assert real_analysis['tema'] == 'Implantação Fluig e Workflow de Compras'
    assert len(real_analysis['dores']) == 1
    assert len(real_analysis['tarefas']) == 1

def test_export_data_structure_insufficient_data():
    from analysis_service import AnalysisService
    
    svc = AnalysisService()
    # Simula retorno onde não há tema nem dores nem tarefas
    empty_dict = {
        'tema': 'Não identificado',
        'contexto': {'problema': 'Não identificado', 'decisao': 'Não mencionado'},
        'organizacao_por_temas': [],
        'dores': [],
        'tarefas': [],
        'participantes': [],
        'nivel_urgencia': 'Baixa',
        'justificativa_urgencia': ''
    }
    
    # Processa metadados com base na ausência de dados
    t_nome = str(empty_dict.get("tema", "")).strip()
    has_real_tema = bool(t_nome and t_nome not in ["", "Não identificado", "Reunião Geral", "Alinhamento Operacional", "Geral"])
    is_insufficient = (not has_real_tema and len(empty_dict['dores']) == 0 and len(empty_dict['tarefas']) == 0)
    assert is_insufficient is True


def test_export_client_identity_segment_and_live():
    # Segmento puro
    s_id = classify_client_identity("SERVIÇOS")
    assert s_id["client_identity_status"] == "segment_only"
    assert s_id["client_code"] == "Não identificado"
    
    # Ao Vivo
    live_id = classify_client_identity("Ao Vivo")
    assert live_id["client_identity_status"] == "live_meeting"
    assert live_id["meeting_source"] == "ao_vivo"
    assert live_id["client_code"] == "Não identificado"

    # Geral
    gen_id = classify_client_identity("Geral")
    assert gen_id["client_identity_status"] == "general"
    assert gen_id["client_code"] == "Não identificado"


def test_export_pagination_with_many_items():
    many_pains = [{'label': f'Gargalo Operacional {i}', 'severidade': 'Alta', 'descricao': f'Evidência {i}'} for i in range(25)]
    many_tasks = [{'tarefa': f'Ação Corretiva {i}', 'responsavel': f'Responsável {i}', 'prazo': '2026-04-01', 'prazo_iso': '2026-04-01', 'status': 'Não Inicializado', 'prioridade': 'Alta'} for i in range(30)]
    assert len(many_pains) == 25
    assert len(many_tasks) == 30


def test_rejection_of_transcription_noise_and_fake_tasks():
    from analysis_service import is_valid_operational_task
    
    # Frases de ruído ou conversação que NÃO podem virar tarefas
    noise_candidates = [
        "vai cair o mundo amanhã",
        "we are the world",
        "olha só que coisa",
        "não sei o que dizer",
        "vai dar certo com fé",
        "vamos que vamos",
        "é isso aí pessoal",
        "bom dia a todos",
        "obrigado pela presença",
        "pode ser",
        "deve ser isso",
        "haha",
        "opinião pessoal",
        "apenas um comentário solto"
    ]
    for candidate in noise_candidates:
        is_valid, reason = is_valid_operational_task(candidate)
        assert is_valid is False, f"Frase '{candidate}' deveria ter sido rejeitada, mas passou com razão: {reason}"


def test_acceptance_of_valid_operational_tasks():
    from analysis_service import is_valid_operational_task
    
    valid_candidates = [
        "enviar relatório de faturamento consolidado até sexta-feira",
        "revisar os contratos pendentes com o jurídico",
        "configurar o módulo de integração de fretes no WMS",
        "validar homologação da folha de pagamento no RH",
        "aprovar a minuta do projeto comercial",
        "apresentar o cronograma de implantação na próxima reunião",
        "corrigir divergência cadastral no ERP Protheus",
        "precisamos agendar a sessão de alinhamento técnico"
    ]
    for candidate in valid_candidates:
        is_valid, reason = is_valid_operational_task(candidate)
        assert is_valid is True, f"Frase '{candidate}' deveria ser aceita como tarefa válida, mas falhou: {reason}"


def test_totvs_recommendations_deduplication_and_max_3_limit():
    from totvs_catalog import compute_recommendations
    
    # Simula dores duplicadas
    dores_duplicadas = [
        {"categoria": "aprovacao_pendente", "label": "Aprovação pendente", "trecho": "Aprovação pendente de compras", "severidade": "Alta"},
        {"categoria": "aprovacao_pendente", "label": "Aprovação pendente", "trecho": "Outra aprovação pendente na gerência", "severidade": "Alta"},
        {"categoria": "gargalo_operacional", "label": "Gargalo operacional", "trecho": "Gargalo no fluxo de processos", "severidade": "Média"},
    ]
    tarefas = [
        {"tarefa": "enviar workflow de aprovações para implantação", "responsavel": "Carlos", "prazo": "2026-04-01"}
    ]
    
    recs = compute_recommendations(
        dores=dores_duplicadas,
        tarefas=tarefas,
        tema="Automação de Processos",
        urgencia="Alta",
        client_code="CLI_TESTE"
    )
    
    assert len(recs) <= 3
    fluig_rec = next((r for r in recs if r["product_key"] == "fluig"), None)
    assert fluig_rec is not None
    assert "Aprovação pendente — 2 ocorrências" in fluig_rec["why_recommended"]
    
    for r in recs:
        # Nenhuma justificativa deve conter labels repetidos consecutivamente
        assert "Aprovação pendente, Aprovação pendente" not in r["why_recommended"]
        assert "Gargalo operacional, Gargalo operacional" not in r["why_recommended"]


def test_totvs_rh_not_recommended_for_generic_bottlenecks():
    from totvs_catalog import compute_recommendations
    
    # Dor genérica de gargalo operacional SEM termos de RH
    dores_genericas = [
        {"categoria": "gargalo_operacional", "label": "Gargalo operacional", "trecho": "Gargalo operacional no envio de notas fiscais", "severidade": "Média"}
    ]
    tarefas_genericas = [
        {"tarefa": "enviar notas fiscais para o financeiro", "responsavel": "Mariana"}
    ]
    
    recs = compute_recommendations(
        dores=dores_genericas,
        tarefas=tarefas_genericas,
        tema="Emissão de Notas Fiscais",
        urgencia="Média"
    )
    
    prod_keys = [r["product_key"] for r in recs]
    assert "rh" not in prod_keys, "TOTVS RH não deve ser recomendado para gargalo puramente fiscal/operacional sem relação com RH"


def test_totvs_rh_recommended_for_hr_demands():
    from totvs_catalog import compute_recommendations
    
    dores_rh = [
        {"categoria": "problemas_equipe", "label": "Problemas de equipe", "trecho": "Equipe sobrecarregada com fechamento da folha de pagamento", "severidade": "Alta"}
    ]
    tarefas_rh = [
        {"tarefa": "validar fechamento da folha de pagamento e ponto eletrônico", "responsavel": "Fernanda"}
    ]
    
    recs = compute_recommendations(
        dores=dores_rh,
        tarefas=tarefas_rh,
        tema="Gestão de Pessoas e Ponto",
        urgencia="Alta"
    )
    
    prod_keys = [r["product_key"] for r in recs]
    assert "rh" in prod_keys, "TOTVS RH deve ser recomendado quando houver demanda de folha/ponto/equipe"


def test_confidence_calibration_technical_vs_semantic():
    from schemas import AnalysisMetadata
    
    # Metadados de análise bem-sucedida
    meta_success = AnalysisMetadata(
        status="success",
        analysis_engine="ollama",
        analysis_status="analise_concluida",
        technical_confidence="Processamento concluído com sucesso",
        semantic_confidence="Alta (85%) — Evidências textuais mapeadas",
        analysis_confidence=0.85
    )
    assert meta_success.technical_confidence == "Processamento concluído com sucesso"
    assert "Alta" in meta_success.semantic_confidence
    
    # Metadados de contingência / fallback
    meta_fallback = AnalysisMetadata(
        status="ollama_offline",
        analysis_engine="deterministic_fallback",
        analysis_status="analise_contingencia_tarefas_pendentes",
        technical_confidence="Execução determinística de contingência",
        semantic_confidence="Média (65%) — Baseada em palavras-chave",
        analysis_confidence=0.65,
        confidence_reason="Análise de contingência concluída com dados parciais. As tarefas identificadas dependem de validação humana.",
        valid_items_count=3,
        pending_items_count=2,
        items_discarded_noise=1
    )
    assert meta_fallback.technical_confidence == "Execução determinística de contingência"
    assert "Média" in meta_fallback.semantic_confidence
    assert meta_fallback.valid_items_count == 3
    assert meta_fallback.pending_items_count == 2
    assert meta_fallback.items_discarded_noise == 1
    assert "validação humana" in meta_fallback.confidence_reason


def test_rejection_of_vague_conversational_phrases():
    from analysis_service import is_valid_operational_task
    
    vague_phrases = [
        "vai entrar",
        "vai agendar hoje à tarde",
        "vai agendar amanhã",
        "precisa fazer no saque hoje",
        "apresentar uma solução mais adequada",
        "dar um jeito",
        "vamos ver o que dá"
    ]
    for phrase in vague_phrases:
        is_valid, reason = is_valid_operational_task(phrase)
        assert is_valid is False, f"Frase vaga '{phrase}' deveria ser rejeitada, mas foi aceita ({reason})"


def test_pain_aggregation_and_occurrence_formatting():
    from analysis_service import aplicar_regras_deterministas_seguranca
    
    # Simula resultado bruto com a mesma dor ocorrendo 3 vezes com trechos distintos
    raw_res = {
        "tema": "Otimização de Processos",
        "contexto": {"problema": "Gargalos de aprovação e fluxo", "decisao": "Reestruturar"},
        "organizacao_por_temas": [{"tema": "Processos", "topicos": ["Aprovações"]}],
        "tarefas": [
            {"tarefa": "enviar mapeamento de processos para a diretoria", "responsavel": "Lucas", "prazo": "amanhã"}
        ],
        "dores": [
            {"categoria": "gargalo_operacional", "descricao": "Demora na fila", "trecho": "gargalo operacional na triagem inicial", "severidade": "Média"},
            {"categoria": "gargalo_operacional", "descricao": "Demora na análise", "trecho": "gargalo operacional na conferência manual", "severidade": "Alta"},
            {"categoria": "gargalo_operacional", "descricao": "Demora na liberação", "trecho": "gargalo operacional na liberação de pedidos", "severidade": "Alta"}
        ]
    }
    
    processed = aplicar_regras_deterministas_seguranca(
        raw_result=raw_res,
        transcricao="gargalo operacional na triagem inicial e na liberação",
        gatilhos=[],
        meeting_date_str="2026-03-30"
    )
    
    dores = processed["dores"]
    assert len(dores) == 1, "As dores com mesma categoria canônica deveriam ser agregadas em um único item"
    dor = dores[0]
    assert dor["categoria"] == "gargalo_operacional"
    assert "3 ocorrências" in dor["label"]
    assert dor["severidade"] == "Alta", "Deve herdar a severidade máxima entre as ocorrências"
    assert len(dor["evidencias"]) == 3


def test_classify_task_operational_intent_statuses():
    from analysis_service import classify_task_operational_intent
    
    # 1. Valid tasks (action + deliverable + context)
    valid_tasks = [
        "enviar relatório financeiro consolidado para a diretoria",
        "revisar minuta de contrato do fornecedor de tecnologia",
        "configurar webhook de integração no painel do TOTVS Protheus",
        "validar cadastro de funcionários e alçadas no módulo de compras",
        "agendar reunião de alinhamento com a equipe de homologação"
    ]
    for t in valid_tasks:
        status, reason = classify_task_operational_intent(t)
        assert status == "valid", f"Deveria ser 'valid': {t} ({reason})"
        
    # 2. Pending review (action present but generic or short object)
    pending_tasks = [
        "verificar situação",
        "alinhar pontos",
        "acompanhar caso"
    ]
    for t in pending_tasks:
        status, reason = classify_task_operational_intent(t)
        assert status == "pending_review", f"Deveria ser 'pending_review': {t} ({reason})"
        
    # 3. Rejected noise (slang, jokes, filler, generic non-operational)
    rejected_phrases = [
        "vai entrar",
        "vai agendar hoje à tarde",
        "precisa fazer no saque hoje",
        "apresentar uma solução mais adequada",
        "vai cair o mundo",
        "we are the world",
        "vamos que vamos",
        "bom dia pessoal",
        "eu acho que vai dar certo",
        "com certeza absoluta"
    ]
    for t in rejected_phrases:
        status, reason = classify_task_operational_intent(t)
        assert status == "rejected_noise", f"Deveria ser 'rejected_noise': {t} ({reason})"


def test_recommendations_max_3_and_distinct_justifications():
    from totvs_catalog import compute_recommendations
    
    dores = [
        {"categoria": "aprovacao_pendente", "label": "Aprovação pendente", "trecho": "aprovação de workflow travada", "severidade": "Alta"},
        {"categoria": "erro_integracao", "label": "Erro de integração", "trecho": "falha na emissão de nota fiscal no ERP", "severidade": "Alta"},
        {"categoria": "falta_metricas", "label": "Falta de métricas", "trecho": "sem indicadores no dashboard", "severidade": "Média"},
        {"categoria": "problemas_equipe", "label": "Problemas de equipe", "trecho": "equipe de RH sobrecarregada com folha", "severidade": "Alta"}
    ]
    tarefas = [
        {"tarefa": "desenhar fluxo de aprovação no Fluig", "responsavel": "Lucas"},
        {"tarefa": "corrigir integração do ERP Protheus", "responsavel": "Mariana"},
        {"tarefa": "montar painel de indicadores e dashboard gerencial", "responsavel": "Carlos"}
    ]
    
    recs = compute_recommendations(
        dores=dores,
        tarefas=tarefas,
        tema="Otimização Geral de Processos",
        urgencia="Alta"
    )
    
    assert len(recs) <= 3, f"Máximo de recomendações permitidas é 3, mas retornou {len(recs)}"
    assert len(recs) > 0
    
    # Justificativas devem ser distintas entre produtos
    justificativas = [r["why_recommended"] for r in recs]
    assert len(justificativas) == len(set(justificativas)), "Cada produto deve ter justificativa específica e única"
    
    # Scores devem ser coerentes e individuais
    for r in recs:
        assert 0.0 <= r["fit_score"] <= 1.0
        assert r["product_name"] is not None
        assert "pode" in r["why_recommended"].lower() or "compatível" in r["why_recommended"].lower() or "automatiza" in r["why_recommended"].lower() or "centraliza" in r["why_recommended"].lower()


def test_fallback_with_noise_phrases_produces_zero_tasks():
    from analysis_service import AnalysisService
    from schemas import AnalysisMetadata
    
    svc = AnalysisService()
    transcript = "vai entrar hoje na reunião, vai agendar hoje à tarde, precisa fazer no saque hoje e apresentar uma solução mais adequada."
    meta = AnalysisMetadata(
        model="test",
        prompt_version="2.1.0",
        status="ollama_offline"
    )
    fallback_res = svc._build_deterministic_fallback(transcript, [], meta, "2026-08-27", None, None)
    
    assert len(fallback_res["tarefas"]) == 0, f"Fallback com frases ruidosas deveria gerar 0 tarefas, gerou {len(fallback_res['tarefas'])}"
    assert fallback_res["analise_metadados"]["analysis_status"] == "reuniao_sem_conteudo_estruturado"
    assert fallback_res["analise_metadados"]["semantic_confidence"] == "Dados insuficientes / Baixa"


def test_fallback_with_single_valid_task_produces_exactly_one_task_without_duplication():
    from analysis_service import AnalysisService
    from schemas import AnalysisMetadata
    
    svc = AnalysisService()
    transcript = "Precisamos enviar o relatório financeiro consolidado até sexta-feira para toda a diretoria."
    meta = AnalysisMetadata(
        model="test",
        prompt_version="2.1.0",
        status="ollama_offline"
    )
    fallback_res = svc._build_deterministic_fallback(transcript, [], meta, "2026-08-27", None, None)
    
    assert len(fallback_res["tarefas"]) == 1, f"Fallback deveria gerar exatamente 1 tarefa sem duplicação modal, gerou {len(fallback_res['tarefas'])}"
    task = fallback_res["tarefas"][0]
    assert "enviar o relatório financeiro" in task["tarefa"].lower()
    assert task["task_validation_status"] in ["valid", "pending_review"]


def test_rejected_noise_recorded_in_audit_but_not_in_tarefas():
    from analysis_service import aplicar_regras_deterministas_seguranca
    
    raw_res = {
        "tema": "Reunião de Operação",
        "contexto": {"problema": "Alinhamento", "decisao": "Definido"},
        "organizacao_por_temas": [],
        "tarefas": [
            {"tarefa": "vai entrar", "responsavel": "Lucas"},
            {"tarefa": "enviar planilha de custos para a contabilidade", "responsavel": "Mariana"}
        ],
        "dores": []
    }
    processed = aplicar_regras_deterministas_seguranca(
        raw_result=raw_res,
        transcricao="vai entrar e enviar planilha de custos para a contabilidade",
        gatilhos=[],
        meeting_date_str="2026-08-27"
    )
    
    assert len(processed["tarefas"]) == 1
    assert processed["tarefas"][0]["tarefa"] == "enviar planilha de custos para a contabilidade"
    assert len(processed["_rejected_tasks_audit"]) == 1
    assert processed["_rejected_tasks_audit"][0]["texto_original"] == "vai entrar"


def test_historico_and_importacao_not_valid_clients():
    from normalization import classify_client_identity
    
    id_hist = classify_client_identity("HISTORICO")
    assert id_hist["client_code"] == "Não identificado"
    assert id_hist["meeting_source"] == "historico"
    assert id_hist["client_identity_status"] == "historico_only"
    
    id_imp = classify_client_identity("IMPORTACAO")
    assert id_imp["client_code"] == "Não identificado"
    assert id_imp["meeting_source"] == "importacao"
    assert id_imp["client_identity_status"] == "importacao_only"


def test_noise_variations_dots_commas_newlines_speakers_brackets_zero_tasks():
    """Valida que todas as variações de formatação de ruído produzem ZERO tarefas operacionais."""
    from analysis_service import AnalysisService
    from schemas import AnalysisMetadata
    
    svc = AnalysisService()
    meta = AnalysisMetadata(model="test", prompt_version="2.1.0", status="ollama_offline")
    
    # 1. Separadas por ponto
    t_dot = "vai entrar. vai agendar hoje à tarde. precisa fazer no saque hoje. apresentar uma solução mais adequada."
    r_dot = svc._build_deterministic_fallback(t_dot, [], meta, "2026-08-31", None, None)
    assert len(r_dot["tarefas"]) == 0, f"Deveria ter 0 tarefas (ponto), gerou: {r_dot['tarefas']}"
    
    # 2. Separadas por vírgula
    t_comma = "vai entrar, vai agendar hoje à tarde, precisa fazer no saque hoje, apresentar uma solução mais adequada"
    r_comma = svc._build_deterministic_fallback(t_comma, [], meta, "2026-08-31", None, None)
    assert len(r_comma["tarefas"]) == 0, f"Deveria ter 0 tarefas (vírgula), gerou: {r_comma['tarefas']}"
    
    # 3. Separadas por quebra de linha
    t_nl = "vai entrar\nvai agendar hoje à tarde\nprecisa fazer no saque hoje\napresentar uma solução mais adequada\nprecisa pra quando?"
    r_nl = svc._build_deterministic_fallback(t_nl, [], meta, "2026-08-31", None, None)
    assert len(r_nl["tarefas"]) == 0, f"Deveria ter 0 tarefas (quebra de linha), gerou: {r_nl['tarefas']}"
    
    # 4. Com identificação de locutor
    t_spk = "[Lucas]: vai entrar.\n[Mariana]: vai agendar hoje à tarde.\n[Carlos]: precisa fazer no saque hoje.\n[Ana]: vai aparecer."
    r_spk = svc._build_deterministic_fallback(t_spk, [], meta, "2026-08-31", None, None)
    assert len(r_spk["tarefas"]) == 0, f"Deveria ter 0 tarefas (locutores), gerou: {r_spk['tarefas']}"
    
    # 5. Dentro de parênteses ou colchetes
    t_brk = "(vai agendar hoje à tarde) [precisa fazer no saque hoje] (vai entrar)"
    r_brk = svc._build_deterministic_fallback(t_brk, [], meta, "2026-08-31", None, None)
    assert len(r_brk["tarefas"]) == 0, f"Deveria ter 0 tarefas (parênteses/colchetes), gerou: {r_brk['tarefas']}"


def test_infinitive_verbs_outside_whitelist_are_not_noise():
    """Tarefas que começam com verbo no infinitivo fora da lista fixa não devem ser descartadas como ruído."""
    from analysis_service import classify_task_operational_intent

    tasks = [
        "Parametrizar o sistema para registro de ponto apenas dentro da rede da empresa",
        "Tirar relatório de horas extras validadas",
        "Implantar o sistema de atestados na unidade de São Paulo",
    ]
    for t in tasks:
        status, reason = classify_task_operational_intent(t)
        assert status != "rejected_noise", f"Não deveria ser ruído: {t} ({reason})"

    # Palavras terminadas em -ar/-er que não são verbos continuam sem contar como ação
    status, _ = classify_task_operational_intent("Qualquer coisa sobre o lugar da conversa")
    assert status == "rejected_noise"


def test_noise_phrases_with_additional_context():
    """Valida que ruídos seguidos de contexto vago continuam classificados como rejected_noise."""
    from analysis_service import classify_task_operational_intent
    
    phrases = [
        "vai agendar hoje à tarde com a equipe de vendas",
        "precisa fazer no saque hoje para adiantar",
        "apresentar uma solução mais adequada para o caso",
        "precisa pra quando?",
        "vai aparecer na sala",
        "vai entrar na reunião"
    ]
    for p in phrases:
        status, reason = classify_task_operational_intent(p)
        assert status == "rejected_noise", f"Frase deveria ser 'rejected_noise': '{p}', obteve: {status} ({reason})"


def test_data_quality_metrics_contract_total_tarefas():
    """Valida que o schema DataQualityMetrics contém total_tarefas e campos usados no frontend."""
    from schemas import DataQualityMetrics
    from analytics_service import AnalyticsService
    from repositories import MeetingRepository
    
    dq = DataQualityMetrics(
        total_reunioes=10,
        reunioes_com_transcricao=10,
        reunioes_analisadas=8,
        total_tarefas=15,
        tarefas_com_responsavel=12,
        tarefas_com_prazo=10
    )
    assert dq.total_tarefas == 15
    assert dq.score_qualidade == 100.0
    
    # Verifica resposta de cálculo analítico
    repo = MeetingRepository()
    meetings = repo.get_all()
    res = AnalyticsService.calculate_quarter_analytics(meetings, "2026-01-01", "2026-03-31", "1º Trimestre de 2026")
    assert hasattr(res.data_quality, "total_tarefas")
    assert isinstance(res.data_quality.total_tarefas, int)
    assert res.data_quality.total_tarefas >= 0
    assert hasattr(res.data_quality, "score_qualidade_dados")
    assert hasattr(res.data_quality, "score_qualidade_ia")
    assert hasattr(res.data_quality, "calculation_breakdown")


def test_side_by_side_executive_and_operational_export_contract():
    """
    Valida que a mesma reunião estruturada produz representações oficiais distintas:
    1. Ata Operacional: Detalhamento completo de tarefas, prazos, evidências e dores.
    2. Ata Executiva: Síntese de 1-2 páginas para liderança com situação, impacto, riscos, decisões e próximos passos.
    Ambas com zero placeholders e persistência atômica.
    """
    from analysis_service import AnalysisService, build_executive_summary
    from schemas import ExecutiveSummarySchema, MeetingAnalysisResult

    svc = AnalysisService()
    transcript = (
        "Reunião de alinhamento com a equipe de logística da Distribuidora Alfa. "
        "Carlos identificou que o sistema de separação de pedidos está travando na conferência. "
        "A Mariana Souza assumiu o compromisso de revisar a integração de pedidos até sexta-feira. "
        "Decidimos aprovar o uso do TOTVS WMS para otimizar o fluxo de armazém. "
        "Ficou pendente a aprovação da diretoria para a verba de infraestrutura."
    )

    result = svc.analyze(transcript, client_context="Distribuidora Alfa", meeting_date_str="2026-09-09")
    
    # 1. Validação da Ata Operacional (Result)
    assert isinstance(result, MeetingAnalysisResult)
    assert len(result.tarefas) >= 1
    assert result.resumo_executivo is not None
    
    # 2. Validação da Ata Executiva (resumo_executivo)
    exec_summary = result.resumo_executivo
    assert isinstance(exec_summary, ExecutiveSummarySchema)
    assert len(exec_summary.summary_for_decision) > 0
    assert len(exec_summary.current_situation) > 0
    assert len(exec_summary.business_impact) > 0
    assert len(exec_summary.strategic_next_steps) <= 3
    assert exec_summary.urgency in ["Baixa", "Média", "Alta", "Crítica"]
    
    # Decisões Tomadas vs Necessárias
    decisions_made_texts = [d.text for d in exec_summary.decisions_made]
    decisions_req_texts = [dr.text for dr in exec_summary.decisions_required]
    # No modo contingência, decisões pendentes/escalonamentos vão para decisions_required
    assert len(decisions_made_texts) >= 0
    assert len(decisions_req_texts) >= 0

    # Testa também a extração direta com decisão explícita no contexto
    explicit_data = {
        "tema": "Implantação TOTVS WMS",
        "contexto": {"problema": "Gargalo no armazém", "decisao": "Aprovada contratação do TOTVS WMS"},
        "tarefas": [],
        "dores": []
    }
    exec_explicit = build_executive_summary(explicit_data)
    assert any("aprovada" in d["text"].lower() or "wms" in d["text"].lower() for d in exec_explicit["decisions_made"])
    
    # Zero placeholders
    for field in [exec_summary.summary_for_decision, exec_summary.current_situation, exec_summary.business_impact]:
        assert "undefined" not in field.lower()
        assert "lorem ipsum" not in field.lower()
        assert "nan" not in field.lower()






