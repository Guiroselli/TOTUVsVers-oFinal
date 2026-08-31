"""
Catálogo detalhado de produtos TOTVS e Motor Híbrido de Recomendação Explicável.
Combina regras determinísticas, cobertura de dores, tarefas, urgência, tabela explícita de segmentos e tratamento de negações.
"""

import re
from typing import List, Dict, Any, Optional, Tuple

CATALOG_VERSION = "2.1.0"

# Tabela explícita de segmentos corporativos e capacidades
SEGMENT_MAP: Dict[str, List[str]] = {
    "MANUFATURA": ["protheus", "supply", "analytics"],
    "SERVICOS": ["fluig", "crm", "rh"],
    "SAUDE": ["rh", "protheus", "fluig"],
    "LOGISTICA": ["supply", "protheus", "analytics"],
    "VAREJO": ["crm", "protheus", "analytics"],
    "FINANCEIRO": ["analytics", "protheus", "fluig"],
    "AGRO": ["protheus", "supply", "analytics"],
    "EDUCACIONAL": ["fluig", "rh", "analytics"],
    "CONSTRUCAO": ["protheus", "supply", "fluig"],
    "DISTRIBUICAO": ["supply", "protheus", "crm"],
}

# Palavras genéricas que NÃO geram recomendação sozinhas
PALAVRAS_GENERICAS = {
    "sistema", "cliente", "reunião", "reuniao", "processo", "problema", 
    "coisa", "assunto", "pauta", "projeto", "demanda", "ajuste", "verificar",
    "falar", "conversar", "alinhar", "revisar", "acompanhar"
}

# Padrões de negação que anulam gatilhos
NEGATION_PATTERNS = [
    r"n[aã]o\s+(?:temos|h[aá]|tivemos|estamos\s+com)\s+(?:nenhum\s+)?problema\s+(?:de|com|em)\s+([a-zá-ú\s]+)",
    r"sem\s+(?:nenhum\s+)?problema\s+(?:de|com|em)\s+([a-zá-ú\s]+)",
    r"j[aá]\s+(?:est[aá]\s+)?resolvido\s+(?:o|a|os|as)?\s+([a-zá-ú\s]+)",
    r"n[aã]o\s+h[aá]\s+(?:gargalo|dificuldade|atraso)\s+(?:em|no|na)\s+([a-zá-ú\s]+)",
    r"n[aã]o\s+(?:precisa|precisamos|h[aá]\s+necessidade)\s+de\s+([a-zá-ú\s]+)",
    r"n[aã]o\s+temos\s+interesse\s+em\s+([a-zá-ú\s]+)",
    r"est[aá]\s+(?:100%|totalmente)\s+(?:garantido|resolvido|estruturado)\s+([a-zá-ú\s]+)",
]

CATALOGO_TOTVS: Dict[str, Dict[str, Any]] = {
    "fluig": {
        "product_key": "fluig",
        "product_name": "TOTVS Fluig",
        "product_area": "Workflow, BPM, ECM e Portais Corporativos",
        "capacidades": [
            "Fluxos formais de aprovação multi-alçada com SLA",
            "Gestão e versionamento eletrônico de documentos (ECM)",
            "Rastreabilidade ponta a ponta de processos e etapas",
            "Notificações automáticas e delegação de responsáveis por tarefa"
        ],
        "dores_atendidas": ["aprovacao_pendente", "documento_faltando"],
        "palavras_fortes": [
            "aprovação", "aprovacao", "alçada", "alcada", "workflow", "fluxo de aprovação", 
            "ecm", "bpm", "assinatura eletrônica", "assinatura eletronica", "documento pendente", 
            "protocolo formal", "parecer formal", "validação de contrato"
        ],
        "palavras_genericas": ["contrato", "documento", "validar", "assinar", "fluxo", "revisão", "revisao"],
        "beneficios_esperados": [
            "Pode reduzir aprovações informais e descentralizadas por e-mail",
            "Dá visibilidade total do responsável e prazos de cada etapa em tempo real",
            "Contribui para eliminar extravios de documentos e perda de prazos regulatórios"
        ],
        "pre_requisitos": [
            "Mapeamento do processo atual e regras de alçada",
            "Definição da matriz de aprovadores por departamento",
            "Validação dos formulários e dados necessários em cada etapa"
        ],
        "dados_necessarios": ["tarefas_confirmadas", "responsavel", "prazo", "codigo_cliente"],
        "proximo_passo_implantacao": "Mapear processo, aprovadores e criar fluxo piloto no TOTVS Fluig.",
        "referencia_oficial": "https://www.totvs.com/fluig/"
    },
    "crm": {
        "product_key": "crm",
        "product_name": "TOTVS CRM Gestão de Clientes",
        "product_area": "Gestão Comercial, Oportunidades e Retenção",
        "capacidades": [
            "Visão 360° do cliente e registro centralizado de interações",
            "Gestão do pipeline de vendas e oportunidades",
            "Acompanhamento sistemático de follow-ups comerciais e pós-venda",
            "Alertas preventivos de insatisfação e risco de cancelamento (churn)"
        ],
        "dores_atendidas": ["insatisfacao_cliente", "atraso_prazo"],
        "palavras_fortes": [
            "pipeline", "proposta comercial", "follow-up", "followup", "churn", "retenção", "retencao",
            "carteira de clientes", "visita comercial", "insatisfação do cliente", "insatisfacao do cliente", 
            "pós-venda", "pos-venda", "funil de vendas", "perda de cliente"
        ],
        "palavras_genericas": ["cliente", "contato", "reunião", "reuniao", "retorno", "visita", "comercial", "satisfação"],
        "beneficios_esperados": [
            "Pode apoiar na retenção de clientes insatisfeitos com atendimento estruturado",
            "Assegura que nenhum compromisso ou follow-up comercial seja esquecido",
            "Centraliza o histórico de relacionamento acessível a toda a equipe"
        ],
        "pre_requisitos": [
            "Cadastro e segmentação atualizada da base de clientes",
            "Estruturação das etapas do funil de relacionamento",
            "Definição de responsáveis por conta/carteira"
        ],
        "dados_necessarios": ["codigo_cliente", "tarefas_confirmadas", "historico_contato"],
        "proximo_passo_implantacao": "Vincular tarefa ao cliente no CRM e criar atividade comercial de follow-up.",
        "referencia_oficial": "https://www.totvs.com/crm/"
    },
    "protheus": {
        "product_key": "protheus",
        "product_name": "TOTVS Protheus (ERP)",
        "product_area": "ERP Backoffice, Gestão Financeira e Operações",
        "capacidades": [
            "Gestão financeira integrada (Contas a Pagar/Receber, Tesouraria e Fluxo de Caixa)",
            "Faturamento, emissão de notas fiscais e conformidade tributária",
            "Planejamento e controle de compras e suprimentos (SIGACOM)",
            "Controle operacional, produção (PCP) e custos integrados"
        ],
        "dores_atendidas": ["gargalo_operacional", "atraso_prazo", "gestao_estoque"],
        "palavras_fortes": [
            "faturamento", "emissão de nf", "emissao de nf", "nota fiscal", "contas a pagar", "contas a receber",
            "conciliação bancária", "conciliacao bancaria", "pcp", "sigacom", "sigafin", "sigafat",
            "fechamento contábil", "fechamento contabil", "tributário", "tributario", "protheus"
        ],
        "palavras_genericas": ["sistema", "pedido", "pagamento", "financeiro", "nf", "erp", "operação", "operacao", "custo", "compra"],
        "beneficios_esperados": [
            "É compatível com a automação de rotinas fiscais, contábeis e financeiras",
            "Ajuda a mitigar gargalos operacionais e retrabalho manual",
            "Proporciona rastreabilidade e integridade aos dados de faturamento e compras"
        ],
        "pre_requisitos": [
            "Identificação do módulo ERP afetado (ex: SIGAFIN, SIGACOM, SIGAEST, SIGAFAT)",
            "Validação dos endpoints da API REST do Protheus",
            "Alinhamento dos parâmetros e dicionário de dados"
        ],
        "dados_necessarios": ["modulo_protheus", "tarefas_confirmadas", "codigo_cliente"],
        "proximo_passo_implantacao": "Identificar módulo, processo impactado e validar endpoint/API no Protheus.",
        "referencia_oficial": "https://www.totvs.com/protheus/"
    },
    "analytics": {
        "product_key": "analytics",
        "product_name": "TOTVS Analytics & Fast Analytics",
        "product_area": "Business Intelligence, Dashboards e Gestão à Vista",
        "capacidades": [
            "Dashboards executivos consolidados com atualização dinâmica",
            "Indicadores de desempenho (KPIs), metas e alertas de desvio",
            "Análise de evolução temporal, tendências e séries históricas",
            "Visão analítica por cliente, segmento, unidade e produto"
        ],
        "dores_atendidas": ["falta_metricas", "falta_visibilidade"],
        "palavras_fortes": [
            "dashboard", "kpi", "indicador de desempenho", "painel analítico", "painel analitico",
            "fast analytics", "business intelligence", "métrica gerencial", "metrica gerencial",
            "visão analítica", "visao analitica", "relatório de indicadores", "relatorio de indicadores", "bi"
        ],
        "palavras_genericas": ["relatório", "relatorio", "métrica", "metrica", "indicador", "medir", "dados", "visão", "visao", "painel", "gráfico", "grafico"],
        "beneficios_esperados": [
            "Pode apoiar na rápida visualização de gargalos e metas corporativas",
            "Substitui relatórios manuais em planilhas dispersas por painéis automatizados",
            "Proporciona embasamento orientado a dados para tomada de decisões estratégicas"
        ],
        "pre_requisitos": [
            "Definição dos KPIs e métricas prioritárias para o negócio",
            "Mapeamento das fontes de dados (ERP, CRM, planilhas)",
            "Definição da periodicidade e perfis de acesso"
        ],
        "dados_necessarios": ["metricas_alvo", "fontes_dados", "periodicidade"],
        "proximo_passo_implantacao": "Definir indicadores prioritários, fontes de dados e periodicidade no Analytics.",
        "referencia_oficial": "https://www.totvs.com/analytics/"
    },
    "rh": {
        "product_key": "rh",
        "product_name": "TOTVS RH (Linha RM / Protheus RH / Meu RH)",
        "product_area": "Gestão de Pessoas, Folha, Ponto e Recrutamento",
        "capacidades": [
            "Folha de pagamento automatizada e atendimento ao eSocial",
            "Gestão de ponto eletrônico, escalas e controle de jornada",
            "Recrutamento, seleção digital e onboarding de colaboradores",
            "Avaliação de desempenho, gestão de clima e capacitação"
        ],
        "dores_atendidas": ["problemas_equipe"],
        "palavras_fortes": [
            "folha de pagamento", "ponto eletrônico", "ponto eletronico", "escala de trabalho", 
            "recrutamento", "onboarding", "esocial", "meu rh", "avaliação de desempenho", 
            "avaliacao de desempenho", "admissão", "admissao", "afastamento", "atestado médico", 
            "atestado medico", "homologação de atestado", "homologacao de atestado", "sobreaviso"
        ],
        "palavras_genericas": ["contratar", "contratação", "contratacao", "equipe", "treinamento", "folha", "pessoal", "escala", "vaga", "rh", "hora extra", "férias", "ferias", "sobrecarga"],
        "beneficios_esperados": [
            "Pode auxiliar no dimensionamento adequado da carga de trabalho da equipe",
            "Agiliza processos seletivos para reposição de quadros e redução de sobrecarga",
            "Garante conformidade trabalhista com gestão digital de jornada e ponto"
        ],
        "pre_requisitos": [
            "Mapeamento da necessidade de headcount ou treinamento",
            "Classificação da demanda (recrutamento, folha, capacitação, escalas)",
            "Aprovação de alçadas de contratação"
        ],
        "dados_necessarios": ["tipo_demanda_rh", "departamento", "tarefas_confirmadas"],
        "proximo_passo_implantacao": "Classificar a demanda e encaminhar ao processo de RH adequado (recrutamento/gestão).",
        "referencia_oficial": "https://www.totvs.com/rh/"
    },
    "supply": {
        "product_key": "supply",
        "product_name": "TOTVS Supply Chain & WMS",
        "product_area": "Gestão de Armazenagem, WMS e Logística",
        "capacidades": [
            "Endereçamento inteligente e gestão operacional de armazéns (WMS)",
            "Controle de inventário físico vs sistêmico em tempo real",
            "Rastreamento de pedidos, expedição e agendamento de entregas",
            "Gestão de fretes e integração com transportadoras"
        ],
        "dores_atendidas": ["gestao_estoque", "atraso_prazo"],
        "palavras_fortes": [
            "wms", "endereçamento inteligente", "enderecamento inteligente", "inventário físico", 
            "inventario fisico", "ruptura de estoque", "gestão de armazém", "gestao de armazem", 
            "expedição e entrega", "expedicao e entrega", "conferência de carga", "conferencia de carga", 
            "tabela de frete", "romaneio", "balança integrada", "balanca integrada"
        ],
        "palavras_genericas": ["estoque", "armazém", "armazem", "entrega", "logística", "logistica", "transporte", "expedição", "expedicao", "material", "fornecedor", "ruptura", "inventário", "inventario"],
        "beneficios_esperados": [
            "Pode prevenir rupturas de estoque e desvios de inventário",
            "Otimiza o fluxo de separação, conferência e expedição de mercadorias",
            "Melhora a pontualidade das entregas e o nível de serviço ao cliente"
        ],
        "pre_requisitos": [
            "Mapeamento do layout de armazenagem e endereçamento",
            "Definição de regras de estocagem (FIFO, FEFO, lote)",
            "Identificação das integrações com transportadoras e ERP"
        ],
        "dados_necessarios": ["tipo_operacao_logistica", "unidade_armazenagem", "tarefas_confirmadas"],
        "proximo_passo_implantacao": "Mapear o processo logístico e identificar módulo de WMS ou integração de fretes.",
        "referencia_oficial": "https://www.totvs.com/supply-chain/"
    }
}


def check_negation(text: str, target_term: str) -> bool:
    """Verifica se o termo alvo está sob efeito de uma negação na frase."""
    if not text:
        return False
    text_lower = text.lower()
    for pat in NEGATION_PATTERNS:
        match = re.search(pat, text_lower)
        if match:
            negated_clause = match.group(0)
            terms = re.split(r"[\s_]+", target_term.lower())
            if target_term.lower() in negated_clause or any(len(w) >= 3 and w in negated_clause for w in terms):
                return True
    return False


def compute_recommendations(
    dores: List[Any],
    tarefas: List[Any],
    tema: str = "",
    urgencia: str = "Média",
    client_code: str = "",
    segmento: str = "",
    integracoes_config: Optional[Dict[str, Any]] = None,
    persisted_recommendations: Optional[Dict[str, Any]] = None,
    full_transcript: str = ""
) -> List[Dict[str, Any]]:
    """
    Motor híbrido explicável de recomendação de produtos TOTVS calibrado.
    Calcula fit_score combinando:
    - 35% Cobertura de Dores (pain_coverage)
    - 25% Compatibilidade de Tarefas (task_fit)
    - 15% Impacto da Urgência (urgency_weight)
    - 15% Adequação ao Segmento/Tema (segment_fit)
    - 10% Disponibilidade da Integração (integration_availability)
    """
    if integracoes_config is None:
        integracoes_config = {}
    if persisted_recommendations is None:
        persisted_recommendations = {}

    # 1. Normaliza dores e evidências
    categorias_dores = []
    dores_com_evidencia = []
    for d in dores:
        if isinstance(d, dict):
            cat = str(d.get("categoria", "outro")).lower()
            categorias_dores.append(cat)
            trecho = d.get("trecho") or d.get("descricao") or ""
            dores_com_evidencia.append({
                "categoria": cat,
                "label": d.get("label") or cat.replace("_", " ").title(),
                "evidence": str(trecho)[:250]
            })
        elif isinstance(d, str):
            from normalization import normalize_pain_category
            cat = normalize_pain_category(d)
            categorias_dores.append(cat)
            dores_com_evidencia.append({
                "categoria": cat,
                "label": cat.replace("_", " ").title(),
                "evidence": d[:250]
            })

    total_dores = len(categorias_dores) or 1

    # 2. Normaliza tarefas
    tarefas_lista = []
    for t in tarefas:
        if isinstance(t, dict):
            texto = str(t.get("tarefa", "")).lower()
            tarefas_lista.append({
                "task": t.get("tarefa", ""),
                "responsible": t.get("responsavel", "Não identificado"),
                "due_date": t.get("prazo", "Não mencionado"),
                "texto_lower": texto
            })

    total_tarefas = len(tarefas_lista) or 1

    # 3. Determina segmento mapeado (sem correspondência por letras soltas)
    segmento_detectado = (segmento or "").upper().strip()
    if not segmento_detectado and client_code:
        # Se client_code for um nome de segmento (ex: 'MANUFATURA', 'SAUDE')
        code_upper = client_code.upper().strip()
        if code_upper in SEGMENT_MAP:
            segmento_detectado = code_upper

    produtos_do_segmento = SEGMENT_MAP.get(segmento_detectado, [])

    recommendations = []

    for key, prod in CATALOGO_TOTVS.items():
        contributing_signals = []
        negated_signals = []

        # 1. Cobertura de dores (35%)
        dores_match = []
        for d in dores_com_evidencia:
            if d["categoria"] in prod["dores_atendidas"]:
                # Verifica negação na evidência
                if d["evidence"] and check_negation(d["evidence"], d["categoria"]):
                    negated_signals.append(f"Dor '{d['label']}' ignorada por negação no texto.")
                else:
                    dores_match.append(d)
                    contributing_signals.append(f"Dor mapeada: {d['label']}")

        pain_coverage = len(dores_match) / total_dores if dores_com_evidencia else 0.0

        # 2. Compatibilidade de tarefas (25%) com separação de termos fortes vs genéricos
        tarefas_match = []
        for t in tarefas_lista:
            # Termos fortes têm prioridade e peso integral
            forte_encontrado = any(kw in t["texto_lower"] for kw in prod["palavras_fortes"])
            generico_encontrado = any(kw in t["texto_lower"] for kw in prod["palavras_genericas"])

            if forte_encontrado or (generico_encontrado and dores_match):
                # Verifica se a tarefa contém negação
                if check_negation(t["texto_lower"], key):
                    negated_signals.append(f"Tarefa '{t['task']}' ignorada por negação contextual.")
                else:
                    tarefas_match.append({
                        "task": t["task"],
                        "responsible": t["responsible"],
                        "due_date": t["due_date"],
                        "strong_match": forte_encontrado
                    })
                    contributing_signals.append(f"Tarefa compatível: {t['task']}")

        # Penaliza se foram apenas palavras genéricas sem correspondência forte
        task_fit_raw = len(tarefas_match) / total_tarefas if tarefas_lista else 0.0
        has_strong_task = any(t.get("strong_match") for t in tarefas_match)
        task_fit = task_fit_raw if (has_strong_task or dores_match) else (task_fit_raw * 0.4)

        # 3. Impacto da urgência (15%)
        urgencia_weight = 0.0
        if urgencia in ["Crítica", "Critica", "Alta"]:
            if dores_match or has_strong_task:
                urgencia_weight = 1.0 if urgencia.startswith("Cr") else 0.8
                contributing_signals.append(f"Urgência {urgencia} elevou a prioridade do módulo")
        elif urgencia == "Média" and (dores_match or has_strong_task):
            urgencia_weight = 0.5
        elif dores_match or has_strong_task:
            urgencia_weight = 0.2

        # 4. Adequação ao Segmento e Tema (15%)
        segment_fit = 0.0
        tema_lower = (tema or "").lower()
        tema_forte = any(kw in tema_lower for kw in prod["palavras_fortes"])
        
        if key in produtos_do_segmento:
            segment_fit += 0.6
            contributing_signals.append(f"Módulo prioritário para o segmento {segmento_detectado}")
        elif not segmento_detectado:
            # Segmento não informado: adequação zero para evitar falsos positivos
            contributing_signals.append("Segmento do cliente não informado / não mapeado")
        
        if tema_forte:
            segment_fit += 0.4
            contributing_signals.append(f"Tema da reunião alinhado diretamente ao módulo: {tema}")

        segment_fit = min(1.0, segment_fit)

        # 5. Disponibilidade da Integração (10%)
        is_configurado = bool(integracoes_config.get(key, {}).get("webhook_url"))
        integration_avail = 1.0 if is_configurado else 0.5
        if is_configurado:
            contributing_signals.append("Webhook oficial configurado no ecossistema")

        # 6. Cálculo do Fit Score Ponderado (5 fatores estritos)
        fit_score = (
            (0.35 * pain_coverage) +
            (0.25 * task_fit) +
            (0.15 * urgencia_weight) +
            (0.15 * segment_fit) +
            (0.10 * integration_avail)
        )

        # Se não houver dores nem tarefas nem tema forte, penaliza expressivamente
        if not dores_match and not has_strong_task and not tema_forte:
            fit_score = round(fit_score * 0.15, 2)
        else:
            fit_score = round(min(1.0, max(0.0, fit_score)), 2)

        # 7. Calibração da Confiança (independente de palavra isolada)
        signals_count = len(contributing_signals)
        seen_ev = set()
        evidences_list = []
        for d in dores_match:
            ev = (d.get("evidence") or d.get("trecho") or "").strip()
            if ev and ev.lower() not in seen_ev:
                seen_ev.add(ev.lower())
                evidences_list.append(ev)

        # Agrupa e deduplica dores atendidas para a justificativa e trigger_pains
        grouped_match = {}
        for d in dores_match:
            cat = d["categoria"]
            if cat not in grouped_match:
                grouped_match[cat] = {
                    "categoria": cat,
                    "label": d.get("label") or cat.replace("_", " ").title(),
                    "evidencias": []
                }
            ev = (d.get("evidence") or d.get("trecho") or "").strip()
            if ev and ev not in grouped_match[cat]["evidencias"]:
                grouped_match[cat]["evidencias"].append(ev)
                
        dedup_trigger_pains = []
        for cat, gm in grouped_match.items():
            cnt = len(gm["evidencias"]) or 1
            dedup_trigger_pains.append({
                "categoria": cat,
                "label": f"{gm['label']} — {cnt} ocorrências" if cnt > 1 else gm["label"],
                "ocorrencias": cnt,
                "evidence": " | ".join(gm["evidencias"][:2]) if gm["evidencias"] else "Mapeada em conformidade com o módulo."
            })
        
        # Base de confiança: qualidade de evidências e múltiplos sinais
        confidence = 0.20
        if evidences_list:
            avg_ev_len = sum(len(e) for e in evidences_list) / len(evidences_list)
            if avg_ev_len > 30:
                confidence += 0.30
            else:
                confidence += 0.15
        if signals_count >= 3:
            confidence += 0.30
        elif signals_count >= 2:
            confidence += 0.15
        if has_strong_task:
            confidence += 0.15
        if dores_match and has_strong_task:
            confidence += 0.10
        if not segmento_detectado:
            confidence -= 0.05
        if negated_signals:
            confidence -= 0.20

        confidence = round(min(0.98, max(0.10, confidence)), 2)

        is_strong = (confidence >= 0.50 and fit_score >= 0.40)
        confidence_label = "Alta" if confidence >= 0.75 else "Média" if confidence >= 0.50 else "Evidência insuficiente para recomendar com segurança"

        # 8. Justificativa Explicável com Deduplicação e Contexto do Módulo
        motivos = []
        if dedup_trigger_pains:
            pain_phrases = [p["label"] for p in dedup_trigger_pains[:2]]
            motivos.append(f"A reunião registrou demandas relacionadas a {', '.join(pain_phrases)}.")

        if tarefas_match:
            motivos.append(f"Identificadas {len(tarefas_match)} tarefa(s) operacionalmente compatíveis com as capacidades do módulo.")
        if urgencia in ["Crítica", "Alta"] and (dores_match or tarefas_match):
            motivos.append(f"O nível de urgência ({urgencia}) reforça a prioridade na estruturação deste processo.")
        if segmento_detectado and key in produtos_do_segmento:
            motivos.append(f"Solução homologada para o segmento {segmento_detectado}.")

        if not motivos:
            why = f"O produto {prod['product_name']} pode apoiar a operação como opção complementar (requer validação de escopo e da API)."
        else:
            why = " ".join(motivos) + f" O {prod['product_name']} pode apoiar a operação, sendo compatível com as rotinas identificadas (requer validação do módulo e da API)."

        persisted = persisted_recommendations.get(key, {})
        review_status = persisted.get("review_status", "pending")

        rec = {
            "product_key": key,
            "product_name": prod["product_name"],
            "product_area": prod["product_area"],
            "fit_score": fit_score,
            "confidence": confidence,
            "confidence_label": confidence_label,
            "is_strong_recommendation": is_strong,
            "why_recommended": why,
            "trigger_pains": dedup_trigger_pains,
            "trigger_tasks": tarefas_match,
            "all_evidences": evidences_list,
            "recommended_capabilities": prod["capacidades"],
            "expected_benefits": prod["beneficios_esperados"],
            "implementation_next_step": prod["proximo_passo_implantacao"],
            "required_inputs": prod["dados_necessarios"],
            "missing_data": [d for d in prod["dados_necessarios"] if d not in ["tarefas_confirmadas", "codigo_cliente"]] if not is_configurado else [],
            "integration_status": "real" if is_configurado else "simulated",
            "contributing_signals": contributing_signals,
            "negated_signals": negated_signals,
            "source": "rule_plus_catalog",
            "review_status": review_status,
            "catalog_version": CATALOG_VERSION,
            "score_breakdown": {
                "pain_coverage": round(pain_coverage, 2),
                "task_fit": round(task_fit, 2),
                "urgency_weight": round(urgencia_weight, 2),
                "segment_fit": round(segment_fit, 2),
                "integration_availability": round(integration_avail, 2)
            }
        }
        recommendations.append(rec)

    recommendations.sort(key=lambda x: x["fit_score"], reverse=True)
    filtradas = [r for r in recommendations if r["fit_score"] >= 0.20 and (r["trigger_pains"] or r["trigger_tasks"])]
    return filtradas[:3]
