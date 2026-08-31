import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple

from normalization import (
    normalize_pain_category, 
    get_pain_metadata, 
    normalize_topic_name, 
    normalize_urgency, 
    normalize_client_code, 
    classify_client_identity,
    normalize_date_iso,
    CANONICAL_TOPICS
)
from schemas import (
    AnalyticsQuarterResponse, 
    TopicMetric, 
    PainMetric, 
    ClientRiskMetric, 
    UrgencyDistributionMetric, 
    TimeSeriesPoint, 
    DataQualityMetrics,
    DrilldownMeetingsResponse,
    DrilldownItem
)


from date_utils import (
    is_task_overdue, 
    days_until_due, 
    _get_base_date, 
    parse_relative_deadline
)


def get_quarter_dates(year: int, quarter: int) -> Tuple[str, str, str]:
    """Retorna (start_date, end_date, label) para um trimestre de um ano."""
    if quarter == 1:
        return f"{year}-01-01", f"{year}-03-31", f"1º Trimestre de {year}"
    elif quarter == 2:
        return f"{year}-04-01", f"{year}-06-30", f"2º Trimestre de {year}"
    elif quarter == 3:
        return f"{year}-07-01", f"{year}-09-30", f"3º Trimestre de {year}"
    elif quarter == 4:
        return f"{year}-10-01", f"{year}-12-31", f"4º Trimestre de {year}"
    else:
        return f"{year}-01-01", f"{year}-12-31", f"Ano {year}"


def get_period_dates(year: int, period_type: str = "quarter", period_num: int = 1) -> Tuple[str, str, str]:
    """Retorna (start_date, end_date, label) para ano inteiro, semestre ou trimestre."""
    period_type = str(period_type).lower().strip()
    if period_type == "year" or period_type == "anual":
        return f"{year}-01-01", f"{year}-12-31", f"Ano de {year} (Completo)"
    elif period_type == "semester" or period_type == "semestral":
        if period_num == 2:
            return f"{year}-07-01", f"{year}-12-31", f"2º Semestre de {year} (Jul-Dez)"
        return f"{year}-01-01", f"{year}-06-30", f"1º Semestre de {year} (Jan-Jun)"
    else:
        # Default trimestre
        return get_quarter_dates(year, period_num)


class AnalyticsService:
    """Serviço analítico para inteligência executiva sobre reuniões."""

    @staticmethod
    def calculate_quarter_analytics(
        meetings: List[Dict[str, Any]], 
        start_date: str, 
        end_date: str,
        period_label: str = "Período Selecionado",
        reference_date: Optional[Any] = None
    ) -> AnalyticsQuarterResponse:
        total_meetings = len(meetings)
        analyzed_meetings_count = 0
        unanalyzed_meetings_count = 0
        
        # Estruturas para agregação
        topics_meetings_map: Dict[str, set] = {}     # canon_key -> set(meeting_ids)
        total_meetings = len(meetings)
        analyzed_meetings_count = 0
        unanalyzed_meetings_count = 0
        
        # Estruturas para agregação
        topics_meetings_map: Dict[str, set] = {}     # canon_key -> set(meeting_ids)
        topics_occurrences: Dict[str, int] = {}       # canon_key -> total count
        topics_labels: Dict[str, str] = {}
        
        pains_meetings_map: Dict[str, set] = {}      # canon_pain -> set(meeting_ids)
        pains_occurrences: Dict[str, int] = {}       # canon_pain -> total count
        pains_clients_map: Dict[str, set] = {}       # canon_pain -> set(valid_client_codes)
        pains_evidence_sample: Dict[str, str] = {}   # canon_pain -> sample quote
        
        urgency_dist = {"critica": 0, "alta": 0, "media": 0, "baixa": 0, "nao_definido": 0}
        
        open_actions = 0
        overdue_actions = 0
        total_actions = 0
        
        # Clientes válidos vs. Segmentos / Reuniões sem cliente identificado
        client_stats: Dict[str, Dict[str, Any]] = {}
        segments_unidentified_stats: Dict[str, Dict[str, Any]] = {}
        time_series_map: Dict[str, Dict[str, Any]] = {}
        
        # Qualidade de dados e IA detalhada
        dq_com_transcricao = 0
        dq_sem_transcricao = 0
        dq_analisadas = 0
        dq_sem_analise = 0
        dq_clientes_validos = 0
        dq_sem_cliente = 0
        dq_datas_validas = 0
        dq_datas_invalidas = 0
        dq_tarefas_com_resp = 0
        dq_tarefas_sem_resp = 0
        dq_tarefas_com_prazo = 0
        dq_tarefas_sem_prazo = 0
        dq_analises_antigas = 0
        dq_falhas_ia = 0
        
        # NPS
        nps_scores: List[float] = []
        nps_promotores = 0
        nps_neutros = 0
        nps_detratores = 0

        for m in meetings:
            m_id = str(m.get("ID_MEETING", ""))
            dt_raw = m.get("DT_MEETING", "")
            dt_norm = normalize_date_iso(dt_raw)
            transcription = str(m.get("ANON_TRANSCRICAO", "")).strip()
            
            # Classificação estrita de identidade (Cliente vs. Segmento vs. Origem)
            raw_client_val = m.get("client_code") or m.get("NOME_SEGMENTO")
            identity = classify_client_identity(raw_client_val)
            c_code = identity["client_code"]
            id_status = identity["client_identity_status"]
            if id_status == "segment_only":
                seg_label = identity.get("segment") or m.get("segment") or (m.get("NOME_SEGMENTO").title() if m.get("NOME_SEGMENTO") else "Serviços")
            elif id_status == "live_meeting":
                seg_label = "Ao Vivo"
            else:
                seg_label = "Geral / Não identificado"
            
            resumo = m.get("RESUMO_IA")
            has_analysis = isinstance(resumo, dict) and bool(resumo)
            
            # Checagens de Qualidade
            if len(transcription) >= 15:
                dq_com_transcricao += 1
            else:
                dq_sem_transcricao += 1

            if has_analysis:
                dq_analisadas += 1
            else:
                dq_sem_analise += 1

            if id_status == "valid_client":
                dq_clientes_validos += 1
            else:
                dq_sem_cliente += 1

            if dt_norm:
                dq_datas_validas += 1
            else:
                dq_datas_invalidas += 1
                
            # NPS Stats
            nps_val = m.get("NOTA_NPS")
            if nps_val is not None and str(nps_val).strip() not in ["", "none", "null", "nan", "-"]:
                try:
                    nps_float = float(nps_val)
                    nps_scores.append(nps_float)
                    if nps_float >= 9:
                        nps_promotores += 1
                    elif nps_float >= 7:
                        nps_neutros += 1
                    else:
                        nps_detratores += 1
                except ValueError:
                    pass

            # Urgência
            urgencia_val = m.get("NIVEL_URGENCIA")
            if not urgencia_val and has_analysis:
                urgencia_val = resumo.get("nivel_urgencia")
            urg_norm = normalize_urgency(urgencia_val)
            
            if urg_norm == "Crítica":
                urgency_dist["critica"] += 1
            elif urg_norm == "Alta":
                urgency_dist["alta"] += 1
            elif urg_norm == "Média":
                urgency_dist["media"] += 1
            elif urg_norm == "Baixa":
                urgency_dist["baixa"] += 1
            else:
                urgency_dist["nao_definido"] += 1

            # Estatísticas por Cliente Válido vs. Segmento Não Identificado
            if id_status == "valid_client":
                if c_code not in client_stats:
                    client_stats[c_code] = {
                        "total_reunioes": 0,
                        "dores_count": 0,
                        "dores_list": [],
                        "urgencias": [],
                        "acoes_pendentes": 0
                    }
                client_stats[c_code]["total_reunioes"] += 1
                client_stats[c_code]["urgencias"].append(urg_norm)
            else:
                if seg_label not in segments_unidentified_stats:
                    segments_unidentified_stats[seg_label] = {
                        "segment_or_source": seg_label,
                        "total_reunioes": 0,
                        "dores_count": 0,
                        "dores_list": [],
                        "urgencias": [],
                        "acoes_pendentes": 0
                    }
                segments_unidentified_stats[seg_label]["total_reunioes"] += 1
                segments_unidentified_stats[seg_label]["urgencias"].append(urg_norm)

            # Série temporal (Agrupamento por Mês YYYY-MM)
            period_key = dt_norm[:7] if dt_norm and len(dt_norm) >= 7 else "Outros"
            if period_key not in time_series_map:
                time_series_map[period_key] = {
                    "periodo": period_key,
                    "label": period_key,
                    "total_reunioes": 0,
                    "reunioes_analisadas": 0,
                    "total_dores": 0,
                    "total_tarefas": 0
                }
            time_series_map[period_key]["total_reunioes"] += 1

            if has_analysis:
                analyzed_meetings_count += 1
                time_series_map[period_key]["reunioes_analisadas"] += 1
                
                # Checa metadados de análise
                analise_meta = resumo.get("analise_metadados")
                if isinstance(analise_meta, dict):
                    if analise_meta.get("prompt_version") != "v2":
                        dq_analises_antigas += 1
                    if analise_meta.get("status") not in ["success", None]:
                        dq_falhas_ia += 1

                # 1. Agregação de Temas (Tema conta no máximo 1x por reunião para reunioes_com_tema)
                temas_na_reuniao = set()
                tema_principal = resumo.get("tema")
                if tema_principal:
                    canon_key, label = normalize_topic_name(tema_principal)
                    temas_na_reuniao.add(canon_key)
                    topics_labels[canon_key] = label
                    topics_occurrences[canon_key] = topics_occurrences.get(canon_key, 0) + 1
                    
                for grupo in resumo.get("organizacao_por_temas", []):
                    if isinstance(grupo, dict):
                        g_nome = grupo.get("tema") or grupo.get("tema_canonico")
                        if g_nome:
                            canon_key, label = normalize_topic_name(g_nome)
                            temas_na_reuniao.add(canon_key)
                            topics_labels[canon_key] = label
                            topicos_count = len(grupo.get("topicos", []))
                            topics_occurrences[canon_key] = topics_occurrences.get(canon_key, 0) + max(1, topicos_count)

                for t_key in temas_na_reuniao:
                    if t_key not in topics_meetings_map:
                        topics_meetings_map[t_key] = set()
                    topics_meetings_map[t_key].add(m_id)

                # 2. Agregação de Dores
                dores_na_reuniao = set()
                dores_list = resumo.get("dores", [])
                for d in dores_list:
                    if isinstance(d, dict):
                        cat = normalize_pain_category(d.get("categoria", "outro"))
                        quote = d.get("trecho") or d.get("descricao") or ""
                    else:
                        cat = normalize_pain_category(str(d))
                        quote = str(d)
                        
                    dores_na_reuniao.add(cat)
                    pains_occurrences[cat] = pains_occurrences.get(cat, 0) + 1
                    if quote and cat not in pains_evidence_sample:
                        pains_evidence_sample[cat] = quote[:180]
                    
                    if id_status == "valid_client":
                        client_stats[c_code]["dores_count"] += 1
                        client_stats[c_code]["dores_list"].append(cat)
                    else:
                        segments_unidentified_stats[seg_label]["dores_count"] += 1
                        segments_unidentified_stats[seg_label]["dores_list"].append(cat)

                    time_series_map[period_key]["total_dores"] += 1

                for d_cat in dores_na_reuniao:
                    if d_cat not in pains_meetings_map:
                        pains_meetings_map[d_cat] = set()
                    pains_meetings_map[d_cat].add(m_id)
                    if id_status == "valid_client":
                        if d_cat not in pains_clients_map:
                            pains_clients_map[d_cat] = set()
                        pains_clients_map[d_cat].add(c_code)

                # 3. Agregação de Tarefas
                tarefas = resumo.get("tarefas", [])
                for t in tarefas:
                    if isinstance(t, dict):
                        total_actions += 1
                        time_series_map[period_key]["total_tarefas"] += 1
                        t_resp = str(t.get("responsavel", "")).strip()
                        if t_resp and t_resp.lower() not in ["não identificado", "nao identificado", "", "-", "none"]:
                            dq_tarefas_com_resp += 1
                        else:
                            dq_tarefas_sem_resp += 1

                        if t.get("prazo_iso") or (t.get("prazo") and str(t.get("prazo")).lower() not in ["não mencionado", "nao mencionado", ""]):
                            dq_tarefas_com_prazo += 1
                        else:
                            dq_tarefas_sem_prazo += 1

                        t_status = str(t.get("status", "Não Inicializado")).strip()
                        if t_status not in ["Concluído", "Concluido", "concluido", "concluído"]:
                            open_actions += 1
                            if id_status == "valid_client":
                                client_stats[c_code]["acoes_pendentes"] += 1
                            else:
                                segments_unidentified_stats[seg_label]["acoes_pendentes"] += 1

                            if is_task_overdue(t, reference_date=reference_date, meeting_date_str=dt_norm):
                                overdue_actions += 1
            else:
                unanalyzed_meetings_count += 1

        # Construção da lista de Temas Mais Discutidos
        top_topics: List[TopicMetric] = []
        for key, meeting_ids in topics_meetings_map.items():
            reunioes_com_tema = len(meeting_ids)
            occurrences = topics_occurrences.get(key, reunioes_com_tema)
            pct = round((reunioes_com_tema / max(1, total_meetings)) * 100, 1)
            top_topics.append(TopicMetric(
                key=key,
                label=topics_labels.get(key, CANONICAL_TOPICS.get(key, key.title())),
                reunioes_com_tema=reunioes_com_tema,
                ocorrencias=occurrences,
                percentual_reunioes=pct
            ))
        top_topics.sort(key=lambda x: (-x.reunioes_com_tema, -x.ocorrencias))

        # Construção da lista de Dores Recorrentes
        recurring_pains: List[PainMetric] = []
        for cat, meeting_ids in pains_meetings_map.items():
            meta = get_pain_metadata(cat)
            reunioes_afetadas = len(meeting_ids)
            total_occ = pains_occurrences.get(cat, reunioes_afetadas)
            pct = round((reunioes_afetadas / max(1, total_meetings)) * 100, 1)
            recurring_pains.append(PainMetric(
                categoria=cat,
                label=meta["label"],
                cor=meta["cor"],
                sistema_totvs=meta["sistema_totvs"],
                severidade=meta["severidade_padrao"],
                reunioes_afetadas=reunioes_afetadas,
                total_ocorrencias=total_occ,
                percentual_reunioes=pct
            ))
        recurring_pains.sort(key=lambda x: (-x.reunioes_afetadas, -x.total_ocorrencias))

        # Construção da lista de Clientes em Risco (Apenas Clientes Válidos)
        clients_at_risk: List[ClientRiskMetric] = []
        for c_code, stats in client_stats.items():
            urgs = stats["urgencias"]
            urg_max = "Crítica" if "Crítica" in urgs else ("Alta" if "Alta" in urgs else ("Média" if "Média" in urgs else ("Baixa" if "Baixa" in urgs else "Não Definido")))
            
            d_counts: Dict[str, int] = {}
            for d in stats["dores_list"]:
                d_counts[d] = d_counts.get(d, 0) + 1
            top_client_dores = [get_pain_metadata(k)["label"] for k, _ in sorted(d_counts.items(), key=lambda x: -x[1])[:3]]

            clients_at_risk.append(ClientRiskMetric(
                codigo_cliente=c_code,
                total_reunioes=stats["total_reunioes"],
                total_dores=stats["dores_count"],
                dores_principais=top_client_dores,
                urgencia_maxima=urg_max,
                acoes_pendentes=stats["acoes_pendentes"]
            ))
        clients_at_risk.sort(key=lambda x: (-x.total_dores, -x.acoes_pendentes, -x.total_reunioes))

        # Construção da lista de Segmentos / Reuniões sem Cliente
        from schemas import SegmentUnidentifiedMetric
        segments_unidentified: List[SegmentUnidentifiedMetric] = []
        for seg_k, s_stats in segments_unidentified_stats.items():
            urgs = s_stats["urgencias"]
            urg_max = "Crítica" if "Crítica" in urgs else ("Alta" if "Alta" in urgs else ("Média" if "Média" in urgs else ("Baixa" if "Baixa" in urgs else "Não Definido")))
            
            d_counts: Dict[str, int] = {}
            for d in s_stats.get("dores_list", []):
                d_counts[d] = d_counts.get(d, 0) + 1
            top_seg_dores = [get_pain_metadata(k)["label"] for k, _ in sorted(d_counts.items(), key=lambda x: -x[1])[:3]]

            segments_unidentified.append(SegmentUnidentifiedMetric(
                segment_or_source=seg_k,
                total_reunioes=s_stats["total_reunioes"],
                total_dores=s_stats["dores_count"],
                dores_principais=top_seg_dores,
                urgencia_maxima=urg_max,
                acoes_pendentes=s_stats["acoes_pendentes"]
            ))
        segments_unidentified.sort(key=lambda x: (-x.total_reunioes, -x.total_dores))

        # Construção da Série Temporal
        time_series: List[TimeSeriesPoint] = []
        for period_key in sorted(time_series_map.keys()):
            if period_key == "Outros":
                continue
            pt = time_series_map[period_key]
            time_series.append(TimeSeriesPoint(
                periodo=pt["periodo"],
                label=pt["label"],
                total_reunioes=pt["total_reunioes"],
                reunioes_analisadas=pt["reunioes_analisadas"],
                total_dores=pt["total_dores"],
                total_tarefas=pt["total_tarefas"]
            ))

        # Cálculo Detalhado de Qualidade dos Dados vs. Qualidade da IA
        total_m_safe = max(1, total_meetings)
        total_t_safe = max(1, total_actions)

        if total_meetings == 0:
            pct_transcricao = 100.0
            pct_clientes = 100.0
            pct_datas = 100.0
            pct_resp_tarefas = 100.0
            pct_prazo_tarefas = 100.0
            score_dados = 100.0
            
            pct_analisadas = 100.0
            pct_sem_falhas = 100.0
            score_ia = 100.0
            score_geral = 100.0
        else:
            pct_transcricao = min(100.0, max(0.0, (dq_com_transcricao / total_m_safe) * 100))
            pct_clientes = min(100.0, max(0.0, (dq_clientes_validos / total_m_safe) * 100))
            pct_datas = min(100.0, max(0.0, (dq_datas_validas / total_m_safe) * 100))
            pct_resp_tarefas = min(100.0, max(0.0, (dq_tarefas_com_resp / total_t_safe) * 100)) if total_actions > 0 else 100.0
            pct_prazo_tarefas = min(100.0, max(0.0, (dq_tarefas_com_prazo / total_t_safe) * 100)) if total_actions > 0 else 100.0
            
            score_dados = round((pct_transcricao * 0.35) + (pct_clientes * 0.25) + (pct_datas * 0.20) + (pct_resp_tarefas * 0.10) + (pct_prazo_tarefas * 0.10), 1)
            score_dados = min(100.0, max(0.0, score_dados))
            
            pct_analisadas = min(100.0, max(0.0, (dq_analisadas / total_m_safe) * 100))
            pct_sem_falhas = min(100.0, max(0.0, 100.0 - ((dq_falhas_ia / total_m_safe) * 100)))
            score_ia = round((pct_analisadas * 0.60) + (pct_sem_falhas * 0.40), 1)
            score_ia = min(100.0, max(0.0, score_ia))
            
            score_geral = round((score_dados * 0.50) + (score_ia * 0.50), 1)
            score_geral = min(100.0, max(0.0, score_geral))

        dq_metrics = DataQualityMetrics(
            total_reunioes=total_meetings,
            reunioes_com_transcricao=dq_com_transcricao,
            reunioes_sem_transcricao=dq_sem_transcricao,
            reunioes_analisadas=dq_analisadas,
            reunioes_sem_analise=dq_sem_analise,
            clientes_identificados=dq_clientes_validos,
            reunioes_sem_cliente=dq_sem_cliente,
            datas_validas=dq_datas_validas,
            datas_invalidas=dq_datas_invalidas,
            total_tarefas=total_actions,
            tarefas_com_responsavel=dq_tarefas_com_resp,
            tarefas_sem_responsavel=dq_tarefas_sem_resp,
            tarefas_com_prazo=dq_tarefas_com_prazo,
            tarefas_sem_prazo=dq_tarefas_sem_prazo,
            analises_antigas=dq_analises_antigas,
            falhas_ia=dq_falhas_ia,
            score_qualidade_dados=score_dados,
            score_qualidade_ia=score_ia,
            score_qualidade=score_geral,
            calculation_breakdown={
                "formula_geral": "50% Qualidade dos Dados + 50% Qualidade da IA",
                "peso_dados_geral": 50,
                "peso_ia_geral": 50,
                "label_dados": "Qualidade dos Dados",
                "label_ia": "Qualidade da IA",
                "label_geral": "Qualidade Geral",
                "pesos_dados": {
                    "transcricao": {"peso": 35, "label": "Reuniões com transcrição válida", "valor_percentual": round(pct_transcricao, 1)},
                    "clientes": {"peso": 25, "label": "Clientes válidos identificados", "valor_percentual": round(pct_clientes, 1)},
                    "datas": {"peso": 20, "label": "Datas padronizadas no padrão ISO", "valor_percentual": round(pct_datas, 1)},
                    "tarefas_responsavel": {"peso": 10, "label": "Tarefas com responsável definido", "valor_percentual": round(pct_resp_tarefas, 1)},
                    "tarefas_prazo": {"peso": 10, "label": "Tarefas com prazo estabelecido", "valor_percentual": round(pct_prazo_tarefas, 1)}
                },
                "pesos_ia": {
                    "analises_concluidas": {"peso": 60, "label": "Reuniões analisadas por IA", "valor_percentual": round(pct_analisadas, 1)},
                    "ausencia_falhas": {"peso": 40, "label": "Ausência de falhas técnicas na IA", "valor_percentual": round(pct_sem_falhas, 1)}
                }
            }
        )

        # NPS Stats
        media_nps = round(sum(nps_scores) / len(nps_scores), 1) if nps_scores else None
        nps_stats = {
            "media": media_nps,
            "total_avaliacoes": len(nps_scores),
            "promotores": nps_promotores,
            "neutros": nps_neutros,
            "detratores": nps_detratores,
            "nps_zone": "Excelente" if (media_nps and media_nps >= 8.5) else ("Qualidade" if (media_nps and media_nps >= 7.0) else "Atenção")
        }

        # Geração de 11 Alertas Gerenciais Automáticos e Coerentes
        from schemas import ManagerialAlert
        managerial_alerts: List[ManagerialAlert] = []

        # 1. Alerta: Dores recorrentes em 3+ reuniões (Critério de Frequência)
        for cat, meeting_ids in pains_meetings_map.items():
            if len(meeting_ids) >= 3:
                meta = get_pain_metadata(cat)
                pct = round((len(meeting_ids) / total_m_safe) * 100, 1)
                clients_affected = list(pains_clients_map.get(cat, []))
                sample_ev = pains_evidence_sample.get(cat)
                managerial_alerts.append(ManagerialAlert(
                    id=f"alert-dor-recorrente-{cat}",
                    type="dor_recorrente",
                    title=f"Dor Recorrente: {meta['label']}",
                    description=f"A dor '{meta['label']}' foi citada em {len(meeting_ids)} reuniões ({pct}% do período) afetando {len(clients_affected)} cliente(s). O módulo TOTVS {meta['sistema_totvs'].upper()} pode apoiar na mitigação dos gargalos relatados (requer validação técnica).",
                    severity="critical" if meta["severidade_padrao"] in ["Crítica", "Alta"] else "warning",
                    metric_key=cat,
                    count=len(meeting_ids),
                    action_type="filter_meetings",
                    action_target=cat,
                    affected_clients=clients_affected[:5],
                    sample_evidence=sample_ev
                ))

        # 2. Alerta: Dores de Alta Severidade / Crítica
        for cat, meeting_ids in pains_meetings_map.items():
            meta = get_pain_metadata(cat)
            if meta["severidade_padrao"] in ["Crítica", "Alta"] and len(meeting_ids) < 3:
                sample_ev = pains_evidence_sample.get(cat)
                managerial_alerts.append(ManagerialAlert(
                    id=f"alert-dor-severa-{cat}",
                    type="dor_alta_severidade",
                    title=f"Dor de Alta Severidade: {meta['label']}",
                    description=f"Identificado ponto crítico de severidade {meta['severidade_padrao']} em {len(meeting_ids)} reunião(ões). Há aderência preliminar com soluções TOTVS {meta['sistema_totvs'].upper()}.",
                    severity="critical" if meta["severidade_padrao"] == "Crítica" else "warning",
                    metric_key=cat,
                    count=len(meeting_ids),
                    action_type="filter_meetings",
                    action_target=cat,
                    sample_evidence=sample_ev
                ))

        # 3. Alerta: Tarefas vencidas com pendência ativa (Critério de Prazo)
        if overdue_actions > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-overdue-tasks",
                type="tarefa_vencida",
                title=f"{overdue_actions} Tarefa(s) Vencida(s) no Período",
                description=f"Existem {overdue_actions} ações operacionais com prazo limite ultrapassado aguardando conclusão.",
                severity="critical" if overdue_actions >= 3 else "warning",
                count=overdue_actions,
                action_type="view_tasks"
            ))

        # 4. Alerta: Tarefas próximas do vencimento (<= 3 dias)
        proximas_vencimento_count = 0
        ref_today = _get_base_date(reference_date) if reference_date else date.today()
        for m in meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                for t in res.get("tarefas", []):
                    if isinstance(t, dict) and str(t.get("status", "")).strip().lower() not in ["concluído", "concluido", "finalizado"]:
                        dias_restantes = days_until_due(t, reference_date=ref_today, meeting_date_str=m.get("DT_MEETING"))
                        if dias_restantes is not None and 0 <= dias_restantes <= 3:
                            proximas_vencimento_count += 1
        if proximas_vencimento_count > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-near-due-tasks",
                type="tarefa_proxima_vencimento",
                title=f"{proximas_vencimento_count} Tarefa(s) Próxima(s) do Vencimento",
                description=f"Ações com prazo nos próximos 3 dias exigem acompanhamento de SLA.",
                severity="warning",
                count=proximas_vencimento_count,
                action_type="view_tasks"
            ))

        # 5. Alerta: Clientes com urgência crítica em múltiplas reuniões
        for c_code, stats in client_stats.items():
            crit_ou_alta = [u for u in stats["urgencias"] if u in ["Crítica", "Alta"]]
            if len(crit_ou_alta) >= 2:
                managerial_alerts.append(ManagerialAlert(
                    id=f"alert-client-urgency-{c_code}",
                    type="cliente_urgencia_critica",
                    title=f"Cliente em Urgência Crítica: {c_code}",
                    description=f"O cliente {c_code} acumulou {len(crit_ou_alta)} reuniões com urgência Alta/Crítica e possui {stats['acoes_pendentes']} ações pendentes.",
                    severity="critical" if "Crítica" in crit_ou_alta else "warning",
                    client_code=c_code,
                    count=len(crit_ou_alta),
                    action_type="open_client",
                    action_target=c_code
                ))

        # 6. Alerta: Reuniões com discussão sem decisão conclusiva
        sem_decisao_count = 0
        for m in meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                ctx = res.get("contexto", {})
                prob = str(ctx.get("problema", "")).lower()
                dec = str(ctx.get("decisao", "")).lower()
                if prob and prob not in ["não mencionado", "nao mencionado", "-", ""] and dec in ["não mencionado", "nao mencionado", "-", ""]:
                    sem_decisao_count += 1
        if sem_decisao_count > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-tema-sem-decisao",
                type="reuniao_sem_decisao",
                title=f"{sem_decisao_count} Reunião(ões) com Discussão Sem Decisão Registrada",
                description="Foram mapeados pontos críticos sem encaminhamento conclusivo deliberado na ata.",
                severity="warning",
                count=sem_decisao_count,
                action_type="filter_meetings"
            ))

        # 7. Alerta: Reuniões sem análise concluída
        if unanalyzed_meetings_count > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-reunioes-sem-analise",
                type="reuniao_sem_analise",
                title=f"{unanalyzed_meetings_count} Reunião(ões) Sem Análise de IA",
                description="Existem atas importadas ou gravadas que ainda não tiveram síntese processada.",
                severity="info",
                count=unanalyzed_meetings_count,
                action_type="filter_meetings"
            ))

        # 8. Alerta: Recomendações TOTVS de alto fit pendentes de validação humana
        recs_pendentes_count = 0
        for m in meetings:
            res = m.get("RESUMO_IA")
            recs = m.get("recomendacoes_totvs") or (res.get("recomendacoes_totvs") if isinstance(res, dict) else [])
            for r in recs or []:
                if isinstance(r, dict) and r.get("fit_score", 0) >= 0.60 and r.get("review_status") == "pending":
                    recs_pendentes_count += 1
        if recs_pendentes_count > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-recs-pendentes",
                type="recomendacao_pendente",
                title=f"{recs_pendentes_count} Recomendação(ões) TOTVS Aguardando Validação",
                description="Oportunidades de produtos com forte aderência preliminar aguardando revisão humana do gestor.",
                severity="info",
                count=recs_pendentes_count
            ))

        # 9. Alerta: Tarefas sem responsável designado
        if dq_tarefas_sem_resp > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-tarefas-sem-responsavel",
                type="tarefa_sem_responsavel",
                title=f"{dq_tarefas_sem_resp} Tarefa(s) Sem Responsável Definido",
                description="Ações operacionais cadastradas sem líder responsável correm alto risco de esquecimento.",
                severity="warning",
                count=dq_tarefas_sem_resp,
                action_type="view_tasks"
            ))

        # 10. Alerta: Tarefas sem prazo definido
        if dq_tarefas_sem_prazo > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-tarefas-sem-prazo",
                type="tarefa_sem_prazo",
                title=f"{dq_tarefas_sem_prazo} Tarefa(s) Sem Prazo de Conclusão",
                description="Tarefas sem SLA estabelecido tendem a acumular atrasos operacionais.",
                severity="warning",
                count=dq_tarefas_sem_prazo,
                action_type="view_tasks"
            ))

        # 11. Alerta: Detratores de NPS / Risco de Relacionamento
        if nps_detratores > 0:
            managerial_alerts.append(ManagerialAlert(
                id="alert-nps-detratores",
                type="nps_detratores",
                title=f"{nps_detratores} Avaliação(ões) com Nota de Detrator no NPS",
                description="Reuniões com notas inferiores a 7 indicam insatisfação ou risco de atrito no cliente.",
                severity="critical",
                count=nps_detratores
            ))

        # Ordenação dos alertas por importância (Crítico -> Atenção -> Informativo)
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        managerial_alerts.sort(key=lambda a: (severity_order.get(a.severity, 3), -(a.count or 0)))

        # 9. Agrupamento de Tarefas Recorrentes / Repetidas (Jaccard + Exato)
        all_period_tasks = []
        for m in meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                for t in res.get("tarefas", []):
                    if isinstance(t, dict):
                        t_desc = str(t.get("tarefa", "")).strip()
                        if len(t_desc) >= 5:
                            all_period_tasks.append({
                                "meeting_id": str(m.get("ID_MEETING", "")),
                                "tarefa": t_desc,
                                "responsavel": t.get("responsavel", "Não identificado"),
                                "prazo": t.get("prazo", "Não mencionado"),
                                "status": t.get("status", "Não Inicializado")
                            })

        duplicate_groups = []
        proc = set()
        for i, t1 in enumerate(all_period_tasks):
            if i in proc:
                continue
            grp = [t1]
            words1 = set(re.findall(r"\w{4,}", t1["tarefa"].lower()))
            for j in range(i + 1, len(all_period_tasks)):
                if j in proc:
                    continue
                t2 = all_period_tasks[j]
                words2 = set(re.findall(r"\w{4,}", t2["tarefa"].lower()))
                if words1 and words2:
                    jaccard = len(words1 & words2) / len(words1 | words2)
                    if jaccard >= 0.45 or t1["tarefa"].lower() == t2["tarefa"].lower():
                        grp.append(t2)
                        proc.add(j)
            if len(grp) > 1:
                proc.add(i)
                m_ids = list(set(t["meeting_id"] for t in grp))
                duplicate_groups.append({
                    "group_title": t1["tarefa"],
                    "similarity_reason": f"Tarefa repetida em {len(m_ids)} reuniões no período selecionado.",
                    "total_occurrences": len(grp),
                    "meeting_ids": m_ids,
                    "tasks": grp,
                    "is_duplicate": True
                })

        # Alerta: Tarefa repetida sem conclusão
        if duplicate_groups:
            duplicadas_abertas = sum(1 for g in duplicate_groups if any(t["status"] != "Concluído" for t in g["tasks"]))
            if duplicadas_abertas > 0:
                managerial_alerts.append(ManagerialAlert(
                    id="alert-tarefa-repetida-sem-conclusao",
                    type="tarefa_repetida_sem_conclusao",
                    title=f"{duplicadas_abertas} Grupo(s) de Tarefas Recorrentes Não Concluídas",
                    description="Identificadas ações operacionais que continuam sendo rediscultidas sem fechamento definitivo.",
                    severity="warning",
                    count=duplicadas_abertas
                ))

        return AnalyticsQuarterResponse(
            period={
                "start_date": start_date,
                "end_date": end_date,
                "label": period_label
            },
            meetings={
                "total": total_meetings,
                "analyzed": analyzed_meetings_count,
                "unanalyzed": unanalyzed_meetings_count
            },
            top_topics=top_topics,
            recurring_pains=recurring_pains,
            open_actions=open_actions,
            overdue_actions=overdue_actions,
            total_actions=total_actions,
            clients_at_risk=clients_at_risk[:15],
            segments_unidentified=segments_unidentified,
            urgency_distribution=UrgencyDistributionMetric(**urgency_dist),
            time_series=time_series,
            data_quality=dq_metrics,
            nps_stats=nps_stats,
            managerial_alerts=managerial_alerts,
            duplicate_task_groups=duplicate_groups
        )

    @staticmethod
    def compare_periods(
        meetings: List[Dict[str, Any]],
        base_start: str,
        base_end: str,
        compare_start: str,
        compare_end: str,
        base_label: str = "Período Base",
        compare_label: str = "Período Comparado"
    ):
        """
        Compara o período base com o período comparativo anterior/selecionado.
        Retorna deltas e tendências calculados matematicamente no backend.
        """
        from schemas import PeriodComparisonResponse, PeriodComparisonTopic

        # Filtra reuniões
        base_meetings = [m for m in meetings if m.get("DT_MEETING") and base_start <= m["DT_MEETING"][:10] <= base_end]
        comp_meetings = [m for m in meetings if m.get("DT_MEETING") and compare_start <= m["DT_MEETING"][:10] <= compare_end]

        # 1. Agregação de temas
        base_topics: Dict[str, int] = {}
        base_labels: Dict[str, str] = {}
        for m in base_meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                t_k, t_lbl = normalize_topic_name(res.get("tema"))
                base_topics[t_k] = base_topics.get(t_k, 0) + 1
                base_labels[t_k] = t_lbl
                for g in res.get("organizacao_por_temas", []):
                    if isinstance(g, dict):
                        gk, gl = normalize_topic_name(g.get("tema") or g.get("tema_canonico"))
                        base_topics[gk] = base_topics.get(gk, 0) + 1
                        base_labels[gk] = gl

        comp_topics: Dict[str, int] = {}
        for m in comp_meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                t_k, t_lbl = normalize_topic_name(res.get("tema"))
                comp_topics[t_k] = comp_topics.get(t_k, 0) + 1
                if t_k not in base_labels:
                    base_labels[t_k] = t_lbl
                for g in res.get("organizacao_por_temas", []):
                    if isinstance(g, dict):
                        gk, gl = normalize_topic_name(g.get("tema") or g.get("tema_canonico"))
                        comp_topics[gk] = comp_topics.get(gk, 0) + 1
                        if gk not in base_labels:
                            base_labels[gk] = gl

        all_topic_keys = set(base_topics.keys()) | set(comp_topics.keys())
        topics_comparison: List[PeriodComparisonTopic] = []
        for tk in all_topic_keys:
            b_cnt = base_topics.get(tk, 0)
            c_cnt = comp_topics.get(tk, 0)
            delta = b_cnt - c_cnt
            pct = round(((delta / c_cnt) * 100), 1) if c_cnt > 0 else (100.0 if b_cnt > 0 else 0.0)
            trend = "aumentou" if delta > 0 else ("diminuiu" if delta < 0 else "estavel")
            topics_comparison.append(PeriodComparisonTopic(
                topic_key=tk,
                label=base_labels.get(tk, tk.title()),
                base_count=b_cnt,
                compare_count=c_cnt,
                delta_count=delta,
                delta_percent=pct,
                trend=trend
            ))
        topics_comparison.sort(key=lambda x: -abs(x.delta_count))

        # 2. Dores novas e resolvidas
        base_pains = set()
        for m in base_meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                for d in res.get("dores", []):
                    c = normalize_pain_category(d.get("categoria") if isinstance(d, dict) else str(d))
                    base_pains.add(c)

        comp_pains = set()
        for m in comp_meetings:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                for d in res.get("dores", []):
                    c = normalize_pain_category(d.get("categoria") if isinstance(d, dict) else str(d))
                    comp_pains.add(c)

        new_pains = [get_pain_metadata(p)["label"] for p in (base_pains - comp_pains)]
        resolved_pains = [get_pain_metadata(p)["label"] for p in (comp_pains - base_pains)]
        persisting_pains = [get_pain_metadata(p)["label"] for p in (base_pains & comp_pains)]

        # 3. Clientes entrando em risco
        def get_clients_at_risk_set(mlist):
            risk_set = set()
            for m in mlist:
                res = m.get("RESUMO_IA")
                c = normalize_client_code(m.get("NOME_SEGMENTO"))
                if c not in ["Geral", "Ao Vivo"]:
                    urg = normalize_urgency(m.get("NIVEL_URGENCIA") or (res.get("nivel_urgencia") if isinstance(res, dict) else ""))
                    if urg in ["Crítica", "Alta"]:
                        risk_set.add(c)
            return risk_set

        base_risk_clients = get_clients_at_risk_set(base_meetings)
        comp_risk_clients = get_clients_at_risk_set(comp_meetings)
        clients_entering_risk = list(base_risk_clients - comp_risk_clients)

        # 4. Ações e Urgência
        def count_actions(mlist):
            open_a = 0
            comp_a = 0
            for m in mlist:
                res = m.get("RESUMO_IA")
                if isinstance(res, dict):
                    for t in res.get("tarefas", []):
                        if isinstance(t, dict):
                            if t.get("status") == "Concluído":
                                comp_a += 1
                            else:
                                open_a += 1
            return open_a, comp_a

        b_open, b_comp = count_actions(base_meetings)
        c_open, c_comp = count_actions(comp_meetings)

        return PeriodComparisonResponse(
            base_period={"start_date": base_start, "end_date": base_end, "label": base_label},
            compare_period={"start_date": compare_start, "end_date": compare_end, "label": compare_label},
            total_meetings_base=len(base_meetings),
            total_meetings_compare=len(comp_meetings),
            total_meetings_delta=len(base_meetings) - len(comp_meetings),
            topics_comparison=topics_comparison,
            new_pains=new_pains,
            resolved_pains=resolved_pains,
            persisting_pains=persisting_pains,
            clients_entering_risk=clients_entering_risk,
            open_actions_delta=b_open - c_open,
            completed_actions_delta=b_comp - c_comp,
            urgency_delta={
                "critica": sum(1 for m in base_meetings if normalize_urgency(m.get("NIVEL_URGENCIA")) == "Crítica") - sum(1 for m in comp_meetings if normalize_urgency(m.get("NIVEL_URGENCIA")) == "Crítica"),
                "alta": sum(1 for m in base_meetings if normalize_urgency(m.get("NIVEL_URGENCIA")) == "Alta") - sum(1 for m in comp_meetings if normalize_urgency(m.get("NIVEL_URGENCIA")) == "Alta")
            }
        )

    @staticmethod
    def calculate_pains_lifecycle(
        meetings: List[Dict[str, Any]], 
        reference_date: Optional[Any] = None
    ):
        """
        Rastreia o ciclo de vida completo e status de resolução de cada dor mapeada.
        """
        from schemas import PainsLifecycleResponse, PainLifecycleItem
        from normalization import PAIN_METADATA

        pain_stats: Dict[str, Dict[str, Any]] = {}
        for cat in PAIN_METADATA.keys():
            meta = get_pain_metadata(cat)
            pain_stats[cat] = {
                "categoria": cat,
                "label": meta["label"],
                "cor": meta["cor"],
                "sistema_totvs": meta["sistema_totvs"],
                "dates": [],
                "meeting_ids": set(),
                "clients": set(),
                "related_tasks": 0,
                "completed_tasks": 0,
                "overdue_tasks": 0,
                "urgencies": []
            }

        for m in meetings:
            mid = str(m.get("ID_MEETING", ""))
            dt = str(m.get("DT_MEETING", ""))[:10]
            client = normalize_client_code(m.get("NOME_SEGMENTO"))
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                dores = res.get("dores", [])
                tarefas = res.get("tarefas", [])
                urg = normalize_urgency(m.get("NIVEL_URGENCIA") or res.get("nivel_urgencia"))

                # Categorias únicas nesta reunião
                cats_in_meeting = set()
                for d in dores:
                    cat = normalize_pain_category(d.get("categoria") if isinstance(d, dict) else str(d))
                    if cat in pain_stats:
                        cats_in_meeting.add(cat)

                for cat in cats_in_meeting:
                    st = pain_stats[cat]
                    st["meeting_ids"].add(mid)
                    if dt:
                        st["dates"].append(dt)
                    if client not in ["Geral", "Ao Vivo"]:
                        st["clients"].add(client)
                    st["urgencies"].append(urg)

                    for t in tarefas:
                        if isinstance(t, dict):
                            st["related_tasks"] += 1
                            t_status = str(t.get("status", "")).strip().lower()
                            if t_status in ["concluído", "concluido", "finalizado"]:
                                st["completed_tasks"] += 1
                            elif is_task_overdue(t, reference_date=reference_date, meeting_date_str=dt):
                                st["overdue_tasks"] += 1

        items: List[PainLifecycleItem] = []
        critical_unresolved = 0

        for cat, st in pain_stats.items():
            if not st["meeting_ids"]:
                continue
            dates_sorted = sorted(st["dates"])
            first_seen = dates_sorted[0] if dates_sorted else None
            last_seen = dates_sorted[-1] if dates_sorted else None
            m_count = len(st["meeting_ids"])
            
            # Tendência: se ocorreu mais no passado ou recente
            trend = "estavel"
            if len(dates_sorted) >= 3:
                mid_point = dates_sorted[len(dates_sorted) // 2]
                recent_count = sum(1 for d in dates_sorted if d >= mid_point)
                if recent_count > (len(dates_sorted) - recent_count):
                    trend = "aumentando"
                elif recent_count < (len(dates_sorted) - recent_count):
                    trend = "reduzindo"

            has_alert = (m_count >= 3 and st["completed_tasks"] < (st["related_tasks"] * 0.5))
            if has_alert:
                critical_unresolved += 1

            curr_urg = "Média"
            if "Crítica" in st["urgencies"]:
                curr_urg = "Crítica"
            elif "Alta" in st["urgencies"]:
                curr_urg = "Alta"

            totvs_name = f"TOTVS {st['sistema_totvs'].upper()}"
            if st["sistema_totvs"] == "fluig":
                totvs_name = "TOTVS Fluig (BPM/ECM)"
            elif st["sistema_totvs"] == "crm":
                totvs_name = "TOTVS CRM Gestão de Clientes"
            elif st["sistema_totvs"] == "protheus":
                totvs_name = "TOTVS Protheus ERP"
            elif st["sistema_totvs"] == "rh":
                totvs_name = "TOTVS RH (Linha RM)"
            elif st["sistema_totvs"] == "supply":
                totvs_name = "TOTVS Supply Chain & WMS"

            items.append(PainLifecycleItem(
                categoria=cat,
                label=st["label"],
                cor=st["cor"],
                sistema_totvs=st["sistema_totvs"],
                first_seen_date=first_seen,
                last_seen_date=last_seen,
                meetings_count=m_count,
                affected_clients_count=len(st["clients"]),
                affected_clients=list(st["clients"])[:8],
                related_tasks_count=st["related_tasks"],
                completed_tasks_count=st["completed_tasks"],
                overdue_tasks_count=st["overdue_tasks"],
                current_urgency=curr_urg,
                trend=trend,
                has_unresolved_alert=has_alert,
                associated_totvs_product=totvs_name
            ))

        items.sort(key=lambda x: (-x.meetings_count, -x.overdue_tasks_count))
        return PainsLifecycleResponse(
            total_pains_tracked=len(items),
            critical_unresolved_pains_count=critical_unresolved,
            items=items
        )

    @staticmethod
    def get_client_timeline(meetings: List[Dict[str, Any]], client_code: str):
        """
        Retorna a jornada cronológica de relacionamento do cliente.
        """
        from schemas import ClientTimelineResponse, ClientTimelineItem

        norm_target = normalize_client_code(client_code)
        client_meetings = []
        for m in meetings:
            c = normalize_client_code(m.get("NOME_SEGMENTO"))
            if c.lower() == norm_target.lower():
                client_meetings.append(m)

        client_meetings.sort(key=lambda x: str(x.get("DT_MEETING", "")), reverse=True)

        timeline: List[ClientTimelineItem] = []
        recurrent_pains: Dict[str, int] = {}
        overdue_tasks_count = 0
        open_tasks_count = 0
        urgencies = []

        for m in client_meetings:
            mid = str(m.get("ID_MEETING", ""))
            dt = str(m.get("DT_MEETING", ""))
            res = m.get("RESUMO_IA")
            has_res = isinstance(res, dict)
            urg = normalize_urgency(m.get("NIVEL_URGENCIA") or (res.get("nivel_urgencia") if has_res else ""))
            urgencies.append(urg)

            dores_labels = []
            if has_res:
                for d in res.get("dores", []):
                    cat = normalize_pain_category(d.get("categoria") if isinstance(d, dict) else str(d))
                    lbl = get_pain_metadata(cat)["label"]
                    dores_labels.append(lbl)
                    recurrent_pains[lbl] = recurrent_pains.get(lbl, 0) + 1

            t_total = 0
            t_conc = 0
            t_venc = 0
            if has_res:
                for t in res.get("tarefas", []):
                    if isinstance(t, dict):
                        t_total += 1
                        if t.get("status") == "Concluído":
                            t_conc += 1
                        else:
                            open_tasks_count += 1
                            if is_task_overdue(t, dt):
                                t_venc += 1
                                overdue_tasks_count += 1

            recs_labels = []
            recs = m.get("recomendacoes_totvs") or (res.get("recomendacoes_totvs") if has_res else [])
            for r in recs or []:
                if isinstance(r, dict):
                    recs_labels.append(r.get("product_name", ""))

            decisao = res.get("contexto", {}).get("decisao") if has_res else None
            tema = res.get("tema") if has_res else "Reunião Geral"

            timeline.append(ClientTimelineItem(
                meeting_id=mid,
                date=dt,
                tema=tema,
                urgencia=urg,
                dores=dores_labels,
                tarefas_total=t_total,
                tarefas_concluidas=t_conc,
                tarefas_vencidas=t_venc,
                decisao=decisao,
                recomendacoes_totvs=recs_labels[:3],
                status_meeting=m.get("STATUS_MEETING", "analise_concluida")
            ))

        # Saúde do relacionamento
        health = "Saudável"
        if "Crítica" in urgencies or overdue_tasks_count >= 3:
            health = "Crítico"
        elif "Alta" in urgencies or overdue_tasks_count >= 1:
            health = "Atenção"

        first_date = timeline[-1].date if timeline else None
        last_date = timeline[0].date if timeline else None

        return ClientTimelineResponse(
            client_code=norm_target,
            total_meetings=len(client_meetings),
            first_meeting_date=first_date,
            last_meeting_date=last_date,
            relationship_health=health,
            recurrent_pains=recurrent_pains,
            overdue_tasks_count=overdue_tasks_count,
            open_tasks_count=open_tasks_count,
            timeline=timeline
        )

    @staticmethod
    def generate_executive_summary(
        meetings: List[Dict[str, Any]],
        start_date: str,
        end_date: str,
        client_code: Optional[str] = None
    ):
        """
        Gera resumo executivo baseado em dados estruturados pré-calculados.
        """
        from schemas import ExecutiveSummaryResponse

        filtered = [m for m in meetings if m.get("DT_MEETING") and start_date <= m["DT_MEETING"][:10] <= end_date]
        if client_code:
            filtered = [m for m in filtered if normalize_client_code(m.get("NOME_SEGMENTO")).lower() == client_code.lower()]

        total_m = len(filtered)
        topics_count: Dict[str, int] = {}
        pains_count: Dict[str, int] = {}
        decisoes: List[str] = []
        tarefas_criticas: List[Dict[str, Any]] = []

        for m in filtered:
            res = m.get("RESUMO_IA")
            if isinstance(res, dict):
                t_k, t_lbl = normalize_topic_name(res.get("tema"))
                topics_count[t_lbl] = topics_count.get(t_lbl, 0) + 1
                for d in res.get("dores", []):
                    cat = normalize_pain_category(d.get("categoria") if isinstance(d, dict) else str(d))
                    lbl = get_pain_metadata(cat)["label"]
                    pains_count[lbl] = pains_count.get(lbl, 0) + 1
                dec = res.get("contexto", {}).get("decisao")
                if dec and dec not in ["Não mencionado", "nao mencionado", "-"]:
                    decisoes.append(dec)
                for t in res.get("tarefas", []):
                    if isinstance(t, dict) and t.get("prioridade") in ["Crítica", "Alta"] and t.get("status") != "Concluído":
                        tarefas_criticas.append({
                            "tarefa": t.get("tarefa"),
                            "responsavel": t.get("responsavel"),
                            "prazo": t.get("prazo"),
                            "prioridade": t.get("prioridade")
                        })

        top_assuntos = [f"{k} ({v} reuniões)" for k, v in sorted(topics_count.items(), key=lambda x: -x[1])[:5]]
        dores_persistentes = [f"{k} (identificada em {v} reuniões)" for k, v in sorted(pains_count.items(), key=lambda x: -x[1])[:5]]

        recomendacoes_proximos_passos = []
        if any("Aprovação" in d for d in dores_persistentes):
            recomendacoes_proximos_passos.append("Estruturar alçadas formais de aprovação e BPM via TOTVS Fluig.")
        if any("Estoque" in d or "Logística" in d for d in dores_persistentes):
            recomendacoes_proximos_passos.append("Padronizar endereçamento e conferência operacional com TOTVS Supply Chain & WMS.")
        if any("Insatisfação" in d for d in dores_persistentes):
            recomendacoes_proximos_passos.append("Instituir régua de follow-up pós-venda estruturada no TOTVS CRM.")
        if not recomendacoes_proximos_passos:
            recomendacoes_proximos_passos.append("Manter acompanhamento sistemático de planos de ação pendentes.")

        resumo_texto = (
            f"No período analisado ({start_date} a {end_date}), foram consolidadas {total_m} reuniões corporativas. "
            f"Os temas com maior concentração de pauta foram {', '.join(top_assuntos[:3]) or 'alinhamentos gerais'}. "
            f"Foram registradas {len(tarefas_criticas)} ações prioritárias em aberto demandando acompanhamento gerencial."
        )

        return ExecutiveSummaryResponse(
            period_label=f"{start_date} a {end_date}",
            principais_assuntos=top_assuntos,
            dores_persistentes=dores_persistentes,
            decisoes_relevantes=decisoes[:5],
            tarefas_criticas=tarefas_criticas[:8],
            recomendacoes_proximos_passos=recomendacoes_proximos_passos,
            resumo_executivo_texto=resumo_texto,
            dados_estruturados={
                "total_reunioes": total_m,
                "top_temas": top_assuntos,
                "top_dores": dores_persistentes,
                "total_tarefas_criticas": len(tarefas_criticas)
            }
        )

    @staticmethod
    def get_drilldown_meetings(
        meetings: List[Dict[str, Any]], 
        metric_type: str, 
        metric_key: str
    ) -> DrilldownMeetingsResponse:
        """
        Retorna as reuniões e evidências textuais associadas a um indicador clicado no dashboard.
        """
        metric_type_norm = metric_type.lower()
        metric_key_norm = metric_key.strip()
        matched_items: List[DrilldownItem] = []

        for m in meetings:
            m_id = str(m.get("ID_MEETING", ""))
            dt = m.get("DT_MEETING", "Data não informada")
            cliente = normalize_client_code(m.get("NOME_SEGMENTO"))
            resumo = m.get("RESUMO_IA")
            has_analysis = isinstance(resumo, dict) and bool(resumo)
            urgencia = normalize_urgency(m.get("NIVEL_URGENCIA") or (resumo.get("nivel_urgencia") if has_analysis else ""))
            tema_principal = resumo.get("tema", "Reunião Geral") if has_analysis else "Sem análise"
            
            evidencias: List[str] = []
            matched = False

            if metric_type_norm == "topic":
                target_key = metric_key_norm.lower()
                if has_analysis:
                    t_principal_key, _ = normalize_topic_name(resumo.get("tema"))
                    if t_principal_key == target_key:
                        matched = True
                        if resumo.get("evidencia_tema"):
                            evidencias.append(f"Tema Principal: {resumo['evidencia_tema']}")
                            
                    for grupo in resumo.get("organizacao_por_temas", []):
                        if isinstance(grupo, dict):
                            g_key, g_label = normalize_topic_name(grupo.get("tema") or grupo.get("tema_canonico"))
                            if g_key == target_key:
                                matched = True
                                for topico in grupo.get("topicos", []):
                                    evidencias.append(f"[{g_label}] {topico}")

            elif metric_type_norm == "pain":
                target_cat = normalize_pain_category(metric_key_norm)
                if has_analysis:
                    for d in resumo.get("dores", []):
                        if isinstance(d, dict):
                            d_cat = normalize_pain_category(d.get("categoria"))
                            if d_cat == target_cat:
                                matched = True
                                trecho = d.get("trecho") or d.get("descricao")
                                if trecho:
                                    evidencias.append(f"🚨 {d.get('label', d_cat)}: \"{trecho}\"")
                        elif isinstance(d, str):
                            if normalize_pain_category(d) == target_cat:
                                matched = True
                                evidencias.append(f"🚨 Alerta: {d}")

            elif metric_type_norm == "urgency":
                if urgencia.lower() == metric_key_norm.lower():
                    matched = True
                    if has_analysis and resumo.get("justificativa_urgencia"):
                        evidencias.append(f"Justificativa: {resumo['justificativa_urgencia']}")

            elif metric_type_norm == "client":
                if cliente.lower() == metric_key_norm.lower():
                    matched = True
                    if has_analysis:
                        evidencias.append(f"Tema: {resumo.get('tema', '')}")

            elif metric_type_norm in ["overdue_actions", "open_actions"]:
                if has_analysis:
                    for t in resumo.get("tarefas", []):
                        if isinstance(t, dict):
                            is_overdue = is_task_overdue(t, dt)
                            if metric_type_norm == "overdue_actions" and is_overdue:
                                matched = True
                                evidencias.append(f"⚠️ Vencida: [{t.get('responsavel')}] {t.get('tarefa')} (Prazo: {t.get('prazo')})")
                            elif metric_type_norm == "open_actions" and t.get("status") != "Concluído":
                                matched = True
                                evidencias.append(f"📋 Pendente: [{t.get('responsavel')}] {t.get('tarefa')} (Status: {t.get('status', 'Não Inicializado')})")

            elif metric_type_norm == "unanalyzed":
                if not has_analysis:
                    matched = True
                    transc = str(m.get("ANON_TRANSCRICAO", ""))
                    evidencias.append(f"Transcrição ({len(transc)} caracteres): {transc[:150]}...")

            if matched:
                matched_items.append(DrilldownItem(
                    meeting_id=m_id,
                    data=dt,
                    cliente=cliente,
                    urgencia=urgencia,
                    tema=tema_principal,
                    evidencias=evidencias[:8]
                ))

        return DrilldownMeetingsResponse(
            metric_type=metric_type,
            metric_key=metric_key,
            total=len(matched_items),
            items=matched_items
        )
