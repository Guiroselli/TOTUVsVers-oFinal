import re
import unicodedata
from datetime import datetime
from typing import Optional, Tuple, Dict, Any


def strip_accents(text: str) -> str:
    """Remove acentos e converte para minúsculas."""
    if not text:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(text))
    return "".join([c for c in nfkd if not unicodedata.combining(c)]).lower().strip()


# Vocabulário canônico de categorias de dores
PAIN_CATEGORIES = {
    "aprovacao_pendente": {
        "label": "Aprovação pendente",
        "cor": "#ef4444",
        "sistema_totvs": "fluig",
        "severidade_padrao": "Alta",
    },
    "atraso_prazo": {
        "label": "Atraso / prazo em risco",
        "cor": "#f59e0b",
        "sistema_totvs": "protheus",
        "severidade_padrao": "Alta",
    },
    "documento_faltando": {
        "label": "Documento não localizado",
        "cor": "#eab308",
        "sistema_totvs": "fluig",
        "severidade_padrao": "Média",
    },
    "gargalo_operacional": {
        "label": "Gargalo operacional",
        "cor": "#ef4444",
        "sistema_totvs": "protheus",
        "severidade_padrao": "Alta",
    },
    "insatisfacao_cliente": {
        "label": "Insatisfação do cliente",
        "cor": "#ec4899",
        "sistema_totvs": "crm",
        "severidade_padrao": "Crítica",
    },
    "falta_metricas": {
        "label": "Falta de Métricas/Visão",
        "cor": "#3b82f6",
        "sistema_totvs": "analytics",
        "severidade_padrao": "Média",
    },
    "problemas_equipe": {
        "label": "Sobrecarga/Falta de Pessoal",
        "cor": "#8b5cf6",
        "sistema_totvs": "rh",
        "severidade_padrao": "Alta",
    },
    "gestao_estoque": {
        "label": "Problemas de Estoque/Logística",
        "cor": "#10b981",
        "sistema_totvs": "supply",
        "severidade_padrao": "Alta",
    },
    "outro": {
        "label": "Ponto de atenção geral",
        "cor": "#a1a1aa",
        "sistema_totvs": "fluig",
        "severidade_padrao": "Baixa",
    },
}

# Mapeamento de aliases e variações para a categoria canônica
PAIN_ALIASES: Dict[str, str] = {
    # aprovacao_pendente
    "aprovacao_pendente": "aprovacao_pendente",
    "aprovacao pendente": "aprovacao_pendente",
    "aprovaçao_pendente": "aprovacao_pendente",
    "aprovacao": "aprovacao_pendente",
    "pendente de aprovacao": "aprovacao_pendente",
    "sem aprovacao": "aprovacao_pendente",
    "quem aprova": "aprovacao_pendente",
    
    # atraso_prazo
    "atraso_prazo": "atraso_prazo",
    "atraso prazo": "atraso_prazo",
    "atraso": "atraso_prazo",
    "prazo_em_risco": "atraso_prazo",
    "prazo em risco": "atraso_prazo",
    "fora do prazo": "atraso_prazo",
    "prazo estourado": "atraso_prazo",
    "atrasado": "atraso_prazo",
    
    # documento_faltando
    "documento_faltando": "documento_faltando",
    "document_faltando": "documento_faltando",
    "documento faltando": "documento_faltando",
    "documento nao localizado": "documento_faltando",
    "falta documento": "documento_faltando",
    "cade o arquivo": "documento_faltando",
    "documento_nao_localizado": "documento_faltando",
    "documento perdido": "documento_faltando",
    
    # gargalo_operacional
    "gargalo_operacional": "gargalo_operacional",
    "garagalo_operacional": "gargalo_operacional",
    "gargalo operacional": "gargalo_operacional",
    "sistema lento": "gargalo_operacional",
    "sistema_lento": "gargalo_operacional",
    "lentidao": "gargalo_operacional",
    "retrabalho": "gargalo_operacional",
    "processo travado": "gargalo_operacional",
    
    # insatisfacao_cliente
    "insatisfacao_cliente": "insatisfacao_cliente",
    "insatisfacao cliente": "insatisfacao_cliente",
    "cliente insatisfeito": "insatisfacao_cliente",
    "reclamacao": "insatisfacao_cliente",
    "reclamacao cliente": "insatisfacao_cliente",
    "insatisfeito": "insatisfacao_cliente",
    "cliente bravo": "insatisfacao_cliente",
    
    # falta_metricas
    "falta_metricas": "falta_metricas",
    "falta metricas": "falta_metricas",
    "falta de relatorios": "falta_metricas",
    "sem visao": "falta_metricas",
    "sem_visao": "falta_metricas",
    "dados espalhados": "falta_metricas",
    "metricas": "falta_metricas",
    
    # problemas_equipe
    "problemas_equipe": "problemas_equipe",
    "problemas equipe": "problemas_equipe",
    "sobrecarga": "problemas_equipe",
    "equipe sobrecarregada": "problemas_equipe",
    "falta de pessoal": "problemas_equipe",
    "falta pessoal": "problemas_equipe",
    "folha de pagamento": "problemas_equipe",
    "rh": "problemas_equipe",
    
    # gestao_estoque
    "gestao_estoque": "gestao_estoque",
    "gestao estoque": "gestao_estoque",
    "problemas estoque": "gestao_estoque",
    "falta estoque": "gestao_estoque",
    "logistica": "gestao_estoque",
    "armazem": "gestao_estoque",
    "entrega": "gestao_estoque",
}

# Categorias canônicas de temas
CANONICAL_TOPICS = {
    "financeiro": "Financeiro & Faturamento",
    "desenvolvimento": "Desenvolvimento & TI",
    "comercial": "Comercial & Vendas",
    "rh": "Recursos Humanos & Gestão de Pessoas",
    "produto": "Produto & Estratégia",
    "operacoes": "Operações & Logística",
    "suporte": "Suporte & Atendimento ao Cliente",
    "juridico": "Jurídico & Compliance",
    "geral": "Alinhamento Geral & Governança",
}

TOPIC_ALIASES = {
    "financeiro": "financeiro",
    "faturamento": "financeiro",
    "contas": "financeiro",
    "fiscal": "financeiro",
    "custos": "financeiro",
    "orcamento": "financeiro",
    
    "desenvolvimento": "desenvolvimento",
    "ti": "desenvolvimento",
    "tech": "desenvolvimento",
    "software": "desenvolvimento",
    "sistema": "desenvolvimento",
    "engenharia": "desenvolvimento",
    "bug": "desenvolvimento",
    
    "comercial": "comercial",
    "vendas": "comercial",
    "negociacao": "comercial",
    "proposta": "comercial",
    "crm": "comercial",
    
    "rh": "rh",
    "recursos humanos": "rh",
    "pessoas": "rh",
    "equipe": "rh",
    "contratacao": "rh",
    "treinamento": "rh",
    
    "produto": "produto",
    "roadmap": "produto",
    "funcionalidade": "produto",
    "features": "produto",
    "estrategia": "produto",
    
    "operacoes": "operacoes",
    "operacao": "operacoes",
    "logistica": "operacoes",
    "estoque": "operacoes",
    "processos": "operacoes",
    
    "suporte": "suporte",
    "atendimento": "suporte",
    "helpdesk": "suporte",
    "chamados": "suporte",
    "pos-venda": "suporte",
    "pos venda": "suporte",
    
    "juridico": "juridico",
    "compliance": "juridico",
    "contrato": "juridico",
    "lgpd": "juridico",
}


def normalize_pain_category(category_input: Any) -> str:
    """
    Normaliza qualquer variação de categoria de dor para sua chave canônica.
    Ex: 'Aprovação Pendente', 'aprovação_pendente', 'garagalo_operacional' -> 'aprovacao_pendente', 'gargalo_operacional'
    """
    if not category_input:
        return "outro"
    
    cleaned = strip_accents(str(category_input))
    cleaned_key = re.sub(r'[\s\-_]+', '_', cleaned)
    
    # 1. Busca direta na tabela de aliases
    if cleaned in PAIN_ALIASES:
        return PAIN_ALIASES[cleaned]
    if cleaned_key in PAIN_ALIASES:
        return PAIN_ALIASES[cleaned_key]
    
    # 2. Busca parcial por palavras-chave
    if "aprov" in cleaned:
        return "aprovacao_pendente"
    if "atras" in cleaned or "prazo" in cleaned:
        return "atraso_prazo"
    if "doc" in cleaned or "arquiv" in cleaned:
        return "documento_faltando"
    if "gargal" in cleaned or "lent" in cleaned or "trav" in cleaned or "retrabalh" in cleaned:
        return "gargalo_operacional"
    if "insatis" in cleaned or "reclam" in cleaned or "queixa" in cleaned:
        return "insatisfacao_cliente"
    if "metric" in cleaned or "relator" in cleaned or "visao" in cleaned:
        return "falta_metricas"
    if "equipe" in cleaned or "pessoal" in cleaned or "sobrecarg" in cleaned or "folha" in cleaned:
        return "problemas_equipe"
    if "estoqu" in cleaned or "logistic" in cleaned or "armaz" in cleaned or "entreg" in cleaned:
        return "gestao_estoque"
    
    if cleaned_key in PAIN_CATEGORIES:
        return cleaned_key
        
    return "outro"


def get_pain_metadata(category: str) -> Dict[str, str]:
    """Retorna metadados canônicos (label, cor, sistema TOTVS, severidade padrão)."""
    canon_key = normalize_pain_category(category)
    return PAIN_CATEGORIES.get(canon_key, PAIN_CATEGORIES["outro"])


def normalize_topic_name(topic_input: Any) -> Tuple[str, str]:
    """
    Normaliza um nome de tema para (chave_canonica, label_canonica).
    Retorna a chave canônica e o nome legível.
    """
    if not topic_input:
        return "geral", CANONICAL_TOPICS["geral"]
        
    raw_str = str(topic_input).strip()
    cleaned = strip_accents(raw_str)
    
    for alias_key, canon_key in TOPIC_ALIASES.items():
        if alias_key in cleaned:
            return canon_key, CANONICAL_TOPICS.get(canon_key, raw_str)
            
    # Se não mapeou para uma das categorias padrão, usa o próprio texto limpo formatado
    formatted_label = raw_str.title() if len(raw_str) > 2 else raw_str.upper()
    canon_key = re.sub(r'[^a-z0-9]+', '_', cleaned).strip('_') or "geral"
    return canon_key, formatted_label


def normalize_date_iso(date_str: Any) -> Optional[str]:
    """
    Normaliza uma string de data para ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS).
    Aceita formatos comuns: '2026-03-18 16:00:00', '18/03/2026', '2026-03-18', '2026-03-18T16:00:00Z', etc.
    """
    if not date_str:
        return None
    
    s = str(date_str).strip()
    if not s or s.lower() in ["none", "null", "nan", "data não informada", "-"]:
        return None
    
    formats_to_try = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
    ]
    
    for fmt in formats_to_try:
        try:
            dt = datetime.strptime(s, fmt)
            if "%H" in fmt:
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
            
    # Fallback regex para capturar YYYY-MM-DD
    match = re.search(r'(\d{4})-(\d{2})-(\d{2})', s)
    if match:
        return match.group(0)
        
    return s


def normalize_client_code(code_str: Any) -> str:
    """Normaliza o código do cliente (ex: 'T27261', 'T-27261', ' 27261 ' -> 'T27261')."""
    if not code_str:
        return "Geral"
    s = str(code_str).strip()
    if not s or s.lower() in ["none", "null", "nan", "-", "ao vivo"]:
        return "Ao Vivo" if s.lower() == "ao vivo" else "Geral"
    
    # Remove espaços
    s = re.sub(r'\s+', '', s).upper()
    return s


def normalize_urgency(urgency_str: Any) -> str:
    """Normaliza nível de urgência para Baixa, Média, Alta, Crítica ou Não Definido."""
    if not urgency_str:
        return "Não Definido"
    cleaned = strip_accents(str(urgency_str))
    if "crit" in cleaned:
        return "Crítica"
    if "alt" in cleaned:
        return "Alta"
    if "med" in cleaned:
        return "Média"
    if "baix" in cleaned:
        return "Baixa"
    return "Não Definido"
