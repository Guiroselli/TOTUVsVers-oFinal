import pytest
from datetime import date
from date_utils import (
    parse_relative_deadline, 
    is_task_overdue, 
    days_until_due
)

def test_parse_explicit_iso_date():
    res = parse_relative_deadline("2026-04-15", "2026-03-20")
    assert res["prazo_iso"] == "2026-04-15"
    assert res["prazo_parse_status"] == "parsed"
    assert res["prazo_confidence"] == 1.0

def test_parse_brazilian_date_full():
    res = parse_relative_deadline("15/04/2026", "2026-03-20")
    assert res["prazo_iso"] == "2026-04-15"
    assert res["prazo_parse_status"] == "parsed"
    assert res["prazo_confidence"] >= 0.90

def test_parse_brazilian_date_short():
    res = parse_relative_deadline("15/04", "2026-03-20")
    assert res["prazo_iso"] == "2026-04-15"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_hoje():
    res = parse_relative_deadline("hoje", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-20"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_amanha():
    res = parse_relative_deadline("amanhã", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-21"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_depois_de_amanha():
    res = parse_relative_deadline("depois de amanhã", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-22"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_em_x_dias():
    res = parse_relative_deadline("em 5 dias", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-25"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_proxima_semana():
    # 2026-03-20 é uma sexta-feira (weekday=4)
    # Próxima segunda é 2026-03-23
    res = parse_relative_deadline("próxima semana", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-23"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_fim_do_mes():
    res = parse_relative_deadline("fim do mês", "2026-03-20")
    assert res["prazo_iso"] == "2026-03-31"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_inicio_do_mes():
    res = parse_relative_deadline("início do mês", "2026-03-20")
    assert res["prazo_iso"] == "2026-04-01"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_relative_dia_semana():
    # Reunião na quarta 2026-03-18 -> "até sexta" deve ser 2026-03-20
    res = parse_relative_deadline("até sexta", "2026-03-18")
    assert res["prazo_iso"] == "2026-03-20"
    assert res["prazo_parse_status"] == "parsed"

def test_parse_ambiguous_deadline_does_not_invent():
    res = parse_relative_deadline("o quanto antes", "2026-03-20")
    assert res["prazo_iso"] is None
    assert res["prazo_parse_status"] == "ambiguous"
    assert res["prazo_confidence"] <= 0.40

def test_parse_not_mentioned_deadline():
    res = parse_relative_deadline("Não mencionado", "2026-03-20")
    assert res["prazo_iso"] is None
    assert res["prazo_parse_status"] == "not_mentioned"

def test_is_task_overdue_injectable_reference_date():
    task_vencida = {"tarefa": "Entregar relatório", "prazo_iso": "2026-03-15", "status": "Não Inicializado"}
    task_futura = {"tarefa": "Revisar fluxo", "prazo_iso": "2026-03-25", "status": "Em Andamento"}
    task_concluida = {"tarefa": "Enviar ata", "prazo_iso": "2026-03-10", "status": "Concluído"}

    # Data de referência fixa injetada no teste: 2026-03-20
    ref_date = "2026-03-20"

    assert is_task_overdue(task_vencida, reference_date=ref_date) is True
    assert is_task_overdue(task_futura, reference_date=ref_date) is False
    assert is_task_overdue(task_concluida, reference_date=ref_date) is False

def test_days_until_due_calculation():
    task = {"tarefa": "Migração", "prazo_iso": "2026-03-25"}
    ref_date = "2026-03-20"

    days = days_until_due(task, reference_date=ref_date)
    assert days == 5

    task_vencida = {"tarefa": "Ajuste", "prazo_iso": "2026-03-18"}
    days_past = days_until_due(task_vencida, reference_date=ref_date)
    assert days_past == -2
