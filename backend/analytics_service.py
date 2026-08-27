import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple

from normalization import (
    normalize_pain_category, 
    get_pain_metadata, 
    normalize_topic_name, 
    normalize_urgency, 
    normalize_client_code, 
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


def is_task_overdue(task: Dict[str, Any], meeting_date_str: Optional[str] = None) -> bool:
    """Verifica se uma tarefa está vencida com base em prazo ISO ou termos de atraso."""
    status = str(task.get("status", "")).strip()
    if status == "Concluído":
        return False
        
    prazo_str = str(task.get("prazo", "")).lower()
    prazo_iso = task.get("prazo_iso")
    
    if any(term in prazo_str for term in ["vencido", "atrasado", "ontem", "passou do prazo", "expirado"]):
        return True
        
    if prazo_iso:
        norm_prazo = normalize_date_iso(prazo_iso)
        if norm_prazo and len(norm_prazo) >= 10:
            today_str = datetime.now().strftime("%Y-%m-%d")
            return norm_prazo[:10] < today_str
            
    return False


class AnalyticsService:
    """Serviço analítico para inteligência executiva sobre reuniões."""

    @staticmethod
    def calculate_quarter_analytics(
        meetings: List[Dict[str, Any]], 
        start_date: str, 
        end_date: str,
        period_label: str = "Período Selecionado"
    ) -> AnalyticsQuarterResponse:
        total_meetings = len(meetings)
        analyzed_meetings_count = 0
        unanalyzed_meetings_count = 0
        
        # Estruturas para agregação
        topics_meetings_map: Dict[str, set] = {}     # canon_key -> set(meeting_ids)
        topics_occurrences: Dict[str, int] = {}       # canon_key -> total count
        topics_labels: Dict[str, str] = {}
        
        pains_meetings_map: Dict[str, set] = {}      # canon_pain -> set(meeting_ids)
        pains_occurrences: Dict[str, int] = {}       # canon_pain -> total count
        
        urgency_dist = {"critica": 0, "alta": 0, "media": 0, "baixa": 0, "nao_definido": 0}
        
        open_actions = 0
        overdue_actions = 0
        total_actions = 0
        
        client_stats: Dict[str, Dict[str, Any]] = {}
        time_series_map: Dict[str, Dict[str, Any]] = {}
        
        # Qualidade de dados
        dq_sem_transcricao = 0
        dq_sem_analise = 0
        dq_sem_cliente = 0
        dq_datas_invalidas = 0
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
            client_code = normalize_client_code(m.get("NOME_SEGMENTO"))
            resumo = m.get("RESUMO_IA")
            has_analysis = isinstance(resumo, dict) and bool(resumo)
            
            # Checagens de Data Quality
            if len(transcription) < 15:
                dq_sem_transcricao += 1
            if not has_analysis:
                dq_sem_analise += 1
            if client_code in ["Geral", "Ao Vivo", ""]:
                dq_sem_cliente += 1
            if not dt_norm:
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

            # Estatísticas por Cliente
            if client_code not in client_stats:
                client_stats[client_code] = {
                    "total_reunioes": 0,
                    "dores_count": 0,
                    "dores_list": [],
                    "urgencias": [],
                    "acoes_pendentes": 0
                }
            client_stats[client_code]["total_reunioes"] += 1

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
                
            client_stats[client_code]["urgencias"].append(urg_norm)

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

                # 1. Agregação de Temas
                # Regra estrita: um tema conta no máximo 1x por reunião para reunioes_com_tema
                temas_na_reuniao = set()
                
                # Do campo tema principal
                tema_principal = resumo.get("tema")
                if tema_principal:
                    canon_key, label = normalize_topic_name(tema_principal)
                    temas_na_reuniao.add(canon_key)
                    topics_labels[canon_key] = label
                    topics_occurrences[canon_key] = topics_occurrences.get(canon_key, 0) + 1
                    
                # Dos grupos de temas
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
                    else:
                        cat = normalize_pain_category(str(d))
                        
                    dores_na_reuniao.add(cat)
                    pains_occurrences[cat] = pains_occurrences.get(cat, 0) + 1
                    client_stats[client_code]["dores_count"] += 1
                    client_stats[client_code]["dores_list"].append(cat)
                    time_series_map[period_key]["total_dores"] += 1

                for d_cat in dores_na_reuniao:
                    if d_cat not in pains_meetings_map:
                        pains_meetings_map[d_cat] = set()
                    pains_meetings_map[d_cat].add(m_id)

                # 3. Agregação de Tarefas
                tarefas = resumo.get("tarefas", [])
                for t in tarefas:
                    if isinstance(t, dict):
                        total_actions += 1
                        time_series_map[period_key]["total_tarefas"] += 1
                        t_status = t.get("status", "Não Inicializado")
                        if t_status != "Concluído":
                            open_actions += 1
                            client_stats[client_code]["acoes_pendentes"] += 1
                            if is_task_overdue(t, dt_norm):
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

        # Construção da lista de Clientes em Risco
        clients_at_risk: List[ClientRiskMetric] = []
        for c_code, stats in client_stats.items():
            if c_code in ["Geral", "Ao Vivo"] and stats["total_reunioes"] == 0:
                continue
            
            # Prioridade de urgência máxima
            urgs = stats["urgencias"]
            if "Crítica" in urgs:
                urg_max = "Crítica"
            elif "Alta" in urgs:
                urg_max = "Alta"
            elif "Média" in urgs:
                urg_max = "Média"
            elif "Baixa" in urgs:
                urg_max = "Baixa"
            else:
                urg_max = "Não Definido"

            # Dores mais frequentes do cliente
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
        # Ordena clientes em risco pelo volume de dores e ações pendentes
        clients_at_risk.sort(key=lambda x: (-x.total_dores, -x.acoes_pendentes, -x.total_reunioes))

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

        # Score de Qualidade de Dados (0 a 100)
        penalidades = (
            (dq_sem_transcricao * 20) +
            (dq_sem_analise * 10) +
            (dq_sem_cliente * 5) +
            (dq_datas_invalidas * 10) +
            (dq_falhas_ia * 15)
        )
        score_dq = max(0.0, min(100.0, round(100.0 - (penalidades / max(1, total_meetings)), 1)))
        
        dq_metrics = DataQualityMetrics(
            reunioes_sem_transcricao=dq_sem_transcricao,
            reunioes_sem_analise=dq_sem_analise,
            reunioes_sem_cliente=dq_sem_cliente,
            datas_invalidas=dq_datas_invalidas,
            analises_antigas=dq_analises_antigas,
            falhas_ia=dq_falhas_ia,
            total_reunioes=total_meetings,
            score_qualidade=score_dq
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
            urgency_distribution=UrgencyDistributionMetric(**urgency_dist),
            time_series=time_series,
            data_quality=dq_metrics,
            nps_stats=nps_stats
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
