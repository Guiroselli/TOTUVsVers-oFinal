"""
Módulo utilitário para parsing avançado de prazos textuais, relativos, brasileiros e ISO,
bem como cálculo determinístico de prazos vencidos e dias até vencimento (SLA).
"""

import re
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, Tuple, Union
import calendar

MESES_PT = {
    "janeiro": 1, "jan": 1,
    "fevereiro": 2, "fev": 2,
    "março": 3, "marco": 3, "mar": 3,
    "abril": 4, "abr": 4,
    "maio": 5, "mai": 5,
    "junho": 6, "jun": 6,
    "julho": 7, "jul": 7,
    "agosto": 8, "ago": 8,
    "setembro": 9, "set": 9,
    "outubro": 10, "out": 10,
    "novembro": 11, "nov": 11,
    "dezembro": 12, "dez": 12,
}

DIAS_SEMANA = {
    "segunda": 0, "segunda-feira": 0, "seg": 0,
    "terça": 1, "terca": 1, "terça-feira": 1, "terca-feira": 1, "ter": 1,
    "quarta": 2, "quarta-feira": 2, "qua": 2,
    "quinta": 3, "quinta-feira": 3, "qui": 3,
    "sexta": 4, "sexta-feira": 4, "sex": 4,
    "sábado": 5, "sabado": 5, "sab": 5,
    "domingo": 6, "dom": 6,
}

TERMOS_NAO_MENCIONADO = {
    "", "none", "null", "-", "não mencionado", "nao mencionado", 
    "não informado", "nao informado", "sem prazo", "nenhum", "não definido", "nao definido"
}

TERMOS_AMBIGUOS = [
    "quando der", "no futuro", "em breve", "assim que possível", "assim que possivel",
    "a combinar", "para depois", "ver depois", "deixar para depois", "mais tarde", 
    "sem data", "a definir", "urgente", "o quanto antes", "asap", "em aberto", 
    "a verificar", "oportunamente", "indefinido"
]


def _get_base_date(meeting_date_str: Optional[Union[str, date]] = None) -> date:
    """Extrai uma data base a partir da data da reunião ou usa a data de hoje."""
    if isinstance(meeting_date_str, date):
        return meeting_date_str
    if meeting_date_str:
        clean_str = str(meeting_date_str).strip().replace("T", " ")
        # Tenta YYYY-MM-DD
        m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", clean_str)
        if m_iso:
            try:
                return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
            except ValueError:
                pass
        # Tenta DD/MM/YYYY
        m_br = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", clean_str)
        if m_br:
            try:
                return date(int(m_br.group(3)), int(m_br.group(2)), int(m_br.group(1)))
            except ValueError:
                pass
    return date.today()


def parse_relative_deadline(prazo_text: Optional[str], meeting_date_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Converte expressões de prazos para formato ISO 8601 (YYYY-MM-DD).
    Usa a data da reunião (meeting_date_str) como âncora para converter expressões relativas.
    Retorna dicionário com prazo_iso, prazo_parse_status e prazo_confidence.
    """
    if not prazo_text:
        return {
            "prazo_original": "Não mencionado",
            "prazo_iso": None,
            "prazo_parse_status": "not_mentioned",
            "prazo_confidence": 0.0
        }

    raw_text = str(prazo_text).strip()
    raw_lower = raw_text.lower()

    # 1. Não mencionado
    if raw_lower in TERMOS_NAO_MENCIONADO:
        return {
            "prazo_original": "Não mencionado",
            "prazo_iso": None,
            "prazo_parse_status": "not_mentioned",
            "prazo_confidence": 0.0
        }

    base_date = _get_base_date(meeting_date_str)

    # 2. Expressões Relativas Específicas com Alta Prioridade
    if "depois de amanhã" in raw_lower or "depois de amanha" in raw_lower:
        d = base_date + timedelta(days=2)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.95
        }
    elif "amanhã" in raw_lower or "amanha" in raw_lower:
        d = base_date + timedelta(days=1)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.95
        }
    elif "hoje" in raw_lower:
        return {
            "prazo_original": raw_text,
            "prazo_iso": base_date.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.95
        }

    # 3. Termos sabidamente ambíguos
    if any(amb in raw_lower for amb in TERMOS_AMBIGUOS):
        return {
            "prazo_original": raw_text,
            "prazo_iso": None,
            "prazo_parse_status": "ambiguous",
            "prazo_confidence": 0.35
        }

    base_date = _get_base_date(meeting_date_str)

    # 4. Data ISO explícita (YYYY-MM-DD)
    m_iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", raw_text)
    if m_iso:
        try:
            d = date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
            return {
                "prazo_original": raw_text,
                "prazo_iso": d.isoformat(),
                "prazo_parse_status": "parsed",
                "prazo_confidence": 1.0
            }
        except ValueError:
            pass

    # 5. Data Brasileira Completa (DD/MM/YYYY ou DD-MM-YYYY)
    m_br_full = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b", raw_text)
    if m_br_full:
        try:
            d = date(int(m_br_full.group(3)), int(m_br_full.group(2)), int(m_br_full.group(1)))
            return {
                "prazo_original": raw_text,
                "prazo_iso": d.isoformat(),
                "prazo_parse_status": "parsed",
                "prazo_confidence": 0.95
            }
        except ValueError:
            pass

    # 6. Data Brasileira Curta (DD/MM) -> infere o ano da reunião
    m_br_short = re.search(r"\b(\d{1,2})[/.-](\d{1,2})\b", raw_text)
    if m_br_short:
        try:
            day = int(m_br_short.group(1))
            month = int(m_br_short.group(2))
            year = base_date.year
            d = date(year, month, day)
            return {
                "prazo_original": raw_text,
                "prazo_iso": d.isoformat(),
                "prazo_parse_status": "parsed",
                "prazo_confidence": 0.90
            }
        except ValueError:
            pass

    # 7. Data por extenso em português (ex: "25 de março", "15 de dezembro de 2026")
    m_extenso = re.search(r"\b(\d{1,2})\s+(?:de\s+)?([a-zçã]+)(?:\s+(?:de\s+)?(\d{4}))?\b", raw_lower)
    if m_extenso:
        day_str, mes_str, year_str = m_extenso.group(1), m_extenso.group(2), m_extenso.group(3)
        if mes_str in MESES_PT:
            try:
                day = int(day_str)
                month = MESES_PT[mes_str]
                year = int(year_str) if year_str else base_date.year
                d = date(year, month, day)
                return {
                    "prazo_original": raw_text,
                    "prazo_iso": d.isoformat(),
                    "prazo_parse_status": "parsed",
                    "prazo_confidence": 0.92
                }
            except ValueError:
                pass

    # 8. "em X dias" / "daqui a X dias"
    m_dias = re.search(r"(?:em|daqui\s+a)\s+(\d+)\s+dias?", raw_lower)
    if m_dias:
        dias = int(m_dias.group(1))
        d = base_date + timedelta(days=dias)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.90
        }

    # 9. "em X semanas" / "daqui a X semanas"
    m_sem = re.search(r"(?:em|daqui\s+a)\s+(\d+)\s+semanas?", raw_lower)
    if m_sem:
        semanas = int(m_sem.group(1))
        d = base_date + timedelta(weeks=semanas)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.90
        }

    # 10. "próxima semana", "semana que vem" -> Segunda-feira da próxima semana
    if "próxima semana" in raw_lower or "proxima semana" in raw_lower or "semana que vem" in raw_lower:
        dias_ate_segunda = (7 - base_date.weekday()) % 7
        if dias_ate_segunda == 0:
            dias_ate_segunda = 7
        d = base_date + timedelta(days=dias_ate_segunda)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.88
        }

    # 11. "fim do mês", "final do mês", "fim de mês" -> último dia do mês corrente
    if "fim do mês" in raw_lower or "final do mês" in raw_lower or "fim do mes" in raw_lower or "final do mes" in raw_lower:
        last_day = calendar.monthrange(base_date.year, base_date.month)[1]
        d = date(base_date.year, base_date.month, last_day)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.88
        }

    # 12. "início do mês", "começo do mês" -> 1º dia do mês seguinte
    if "início do mês" in raw_lower or "inicio do mes" in raw_lower or "começo do mês" in raw_lower or "comeco do mes" in raw_lower:
        next_month = base_date.month + 1 if base_date.month < 12 else 1
        next_year = base_date.year if base_date.month < 12 else base_date.year + 1
        d = date(next_year, next_month, 1)
        return {
            "prazo_original": raw_text,
            "prazo_iso": d.isoformat(),
            "prazo_parse_status": "parsed",
            "prazo_confidence": 0.85
        }

    # 13. Dias da semana específicos: "até sexta", "nesta sexta-feira", "na próxima terça"
    for dia_nome, dia_num in DIAS_SEMANA.items():
        if dia_nome in raw_lower:
            dias_a_frente = (dia_num - base_date.weekday()) % 7
            if dias_a_frente == 0:
                dias_a_frente = 7  # Próxima ocorrência
            d = base_date + timedelta(days=dias_a_frente)
            return {
                "prazo_original": raw_text,
                "prazo_iso": d.isoformat(),
                "prazo_parse_status": "parsed",
                "prazo_confidence": 0.88
            }

    # Se não bateu com nenhum padrão, trata como ambíguo sem inventar data
    return {
        "prazo_original": raw_text,
        "prazo_iso": None,
        "prazo_parse_status": "ambiguous",
        "prazo_confidence": 0.40
    }


def is_task_overdue(
    task: Dict[str, Any], 
    reference_date: Optional[Union[str, date]] = None,
    meeting_date_str: Optional[str] = None
) -> bool:
    """
    Verifica se uma tarefa está vencida em relação a uma data de referência.
    Se reference_date for omitido, usa a data atual (date.today()).
    """
    if not isinstance(task, dict):
        return False
        
    status = str(task.get("status", "")).strip().lower()
    if status in ["concluído", "concluido", "finalizado", "encerrado"]:
        return False
        
    ref_d = _get_base_date(reference_date) if reference_date else date.today()
    ref_iso = ref_d.strftime("%Y-%m-%d")
    
    prazo_iso = task.get("prazo_iso")
    if prazo_iso:
        norm_prazo = str(prazo_iso).strip()
        if len(norm_prazo) >= 10:
            return norm_prazo[:10] < ref_iso
            
    # Se não tem prazo_iso, tenta resolver o prazo textual
    prazo_raw = str(task.get("prazo", "")).strip()
    prazo_lower = prazo_raw.lower()
    
    if any(term in prazo_lower for term in ["vencido", "atrasado", "expirado", "passou do prazo"]):
        return True
        
    # Se tem prazo textual e meeting_date_str, tenta fazer parse
    if prazo_raw and prazo_lower not in TERMOS_NAO_MENCIONADO and prazo_lower not in TERMOS_AMBIGUOS:
        parsed = parse_relative_deadline(prazo_raw, meeting_date_str)
        if parsed.get("prazo_iso"):
            return parsed["prazo_iso"][:10] < ref_iso
            
    return False


def days_until_due(
    task: Dict[str, Any], 
    reference_date: Optional[Union[str, date]] = None,
    meeting_date_str: Optional[str] = None
) -> Optional[int]:
    """
    Retorna o número de dias até o vencimento da tarefa em relação a reference_date.
    Retorna negativo se vencida, 0 se vence hoje, positivo se no futuro, ou None se não houver data.
    """
    if not isinstance(task, dict):
        return None
        
    ref_d = _get_base_date(reference_date) if reference_date else date.today()
    
    prazo_iso = task.get("prazo_iso")
    if not prazo_iso:
        prazo_raw = str(task.get("prazo", "")).strip()
        if prazo_raw and prazo_raw.lower() not in TERMOS_NAO_MENCIONADO and prazo_raw.lower() not in TERMOS_AMBIGUOS:
            parsed = parse_relative_deadline(prazo_raw, meeting_date_str)
            prazo_iso = parsed.get("prazo_iso")
            
    if prazo_iso and len(prazo_iso) >= 10:
        try:
            target_d = date(int(prazo_iso[:4]), int(prazo_iso[5:7]), int(prazo_iso[8:10]))
            return (target_d - ref_d).days
        except ValueError:
            return None
            
    return None
