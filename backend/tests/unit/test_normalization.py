import pytest
from normalization import (
    normalize_date_iso,
    normalize_client_code,
    normalize_topic_name,
    normalize_pain_category,
    normalize_urgency,
    get_pain_metadata
)

def test_normalize_date_iso():
    assert normalize_date_iso("2026-03-25 14:30:00") == "2026-03-25 14:30:00"
    assert normalize_date_iso("25/03/2026") == "2026-03-25"
    assert normalize_date_iso("2026-03-25T10:00:00Z") == "2026-03-25 10:00:00"
    assert normalize_date_iso("Data não informada") is None
    assert normalize_date_iso(None) is None

def test_normalize_client_code():
    assert normalize_client_code("t27261") == "T27261"
    assert normalize_client_code("  cli_102  ") == "CLI_102"
    assert normalize_client_code("") == "Geral"
    assert normalize_client_code(None) == "Geral"

def test_normalize_topic_name():
    key, label = normalize_topic_name("Alinhamento Financeiro e Faturamento")
    assert key == "financeiro"
    assert label == "Financeiro & Faturamento"
    
    key, label = normalize_topic_name("Impasses em Tecnologia e Bugs")
    assert key == "desenvolvimento"

def test_normalize_pain_category():
    assert normalize_pain_category("aprovacao_pendente") == "aprovacao_pendente"
    assert normalize_pain_category("atraso") == "atraso_prazo"
    assert normalize_pain_category("documento") == "documento_faltando"
    assert normalize_pain_category("churn") == "insatisfacao_cliente"
    assert normalize_pain_category("estoque") == "gestao_estoque"
    assert normalize_pain_category("desconhecido") == "outro"

def test_normalize_urgency():
    assert normalize_urgency("CRITICA") == "Crítica"
    assert normalize_urgency("alta") == "Alta"
    assert normalize_urgency("Media") == "Média"
    assert normalize_urgency("baixa") == "Baixa"
    assert normalize_urgency("") == "Não Definido"

def test_classify_client_identity():
    from normalization import classify_client_identity
    
    # Ao Vivo
    live_res = classify_client_identity("Ao Vivo")
    assert live_res["client_identity_status"] == "live_meeting"
    assert live_res["meeting_source"] == "ao_vivo"
    assert live_res["client_code"] == "Não identificado"
    
    # Geral
    gen_res = classify_client_identity("Geral")
    assert gen_res["client_identity_status"] == "general"
    assert gen_res["client_code"] == "Não identificado"
    
    # Segmentos puros
    seg_serv = classify_client_identity("SERVICOS")
    assert seg_serv["client_identity_status"] == "segment_only"
    assert seg_serv["segment"] in ["Servicos", "Serviços"]
    assert seg_serv["client_code"] == "Não identificado"
    
    seg_fin = classify_client_identity("FINANCEIRO")
    assert seg_fin["client_identity_status"] == "segment_only"
    assert seg_fin["segment"] == "Financeiro"
    
    # Clientes válidos
    cli_res = classify_client_identity("CLI_1018803")
    assert cli_res["client_identity_status"] == "valid_client"
    assert cli_res["client_code"] == "CLI_1018803"
    
    cli_t = classify_client_identity("T27261")
    assert cli_t["client_identity_status"] == "valid_client"
    assert cli_t["client_code"] == "T27261"


def test_normalize_date_iso_impossible_dates():
    assert normalize_date_iso("32/13/2026") is None
    assert normalize_date_iso("2026-02-30") is None
    assert normalize_date_iso("2026-13-45") is None
    assert normalize_date_iso("99/99/9999") is None
    assert normalize_date_iso("texto aleatório não data") is None
    assert normalize_date_iso("2026-00-10") is None


def test_classify_client_identity_accents():
    from normalization import classify_client_identity
    
    # SERVIÇOS com acento
    s_accent = classify_client_identity("SERVIÇOS")
    assert s_accent["client_identity_status"] == "segment_only"
    assert s_accent["client_code"] == "Não identificado"
    assert s_accent["segment"] in ["Servicos", "Serviços"]

    # LOGÍSTICA com acento
    log_accent = classify_client_identity("LOGÍSTICA")
    assert log_accent["client_identity_status"] == "segment_only"
    assert log_accent["client_code"] == "Não identificado"


def test_date_utils_relative_and_overdue_fixed_reference():
    from date_utils import parse_relative_deadline, is_task_overdue, days_until_due
    
    anchor = "2026-03-10"
    
    # Prazo relativo: "em 5 dias" ancorado em 2026-03-10 -> 2026-03-15
    parsed_5d = parse_relative_deadline("em 5 dias", anchor)
    assert parsed_5d["prazo_iso"] == "2026-03-15"
    assert parsed_5d["prazo_parse_status"] == "parsed"

    # Prazo relativo: "amanhã" ancorado em 2026-03-10 -> 2026-03-11
    parsed_tomorrow = parse_relative_deadline("amanhã", anchor)
    assert parsed_tomorrow["prazo_iso"] == "2026-03-11"

    # Tarefa atrasada com referência fixa: 2026-03-20
    task_late = {
        "tarefa": "Enviar proposta",
        "prazo_iso": "2026-03-15",
        "status": "Não Inicializado"
    }
    assert is_task_overdue(task_late, reference_date="2026-03-20") is True
    assert days_until_due(task_late, reference_date="2026-03-20") == -5

    # Tarefa concluída NÃO deve ser considerada vencida
    task_done = {
        "tarefa": "Enviar proposta",
        "prazo_iso": "2026-03-15",
        "status": "Concluído"
    }
    assert is_task_overdue(task_done, reference_date="2026-03-20") is False

    # Tarefa futura com referência fixa: 2026-03-10
    assert is_task_overdue(task_late, reference_date="2026-03-10") is False
    assert days_until_due(task_late, reference_date="2026-03-10") == 5


def test_get_pain_metadata():
    meta = get_pain_metadata("aprovacao_pendente")
    assert meta["sistema_totvs"] == "fluig"
    assert "Aprovação" in meta["label"]

