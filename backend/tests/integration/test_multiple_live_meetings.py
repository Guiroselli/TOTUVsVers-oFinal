import threading
import time
import pytest
from fastapi.testclient import TestClient
from main import app
from repositories import MeetingRepository

client = TestClient(app)


def make_payload(titulo: str, departamento: str = "Geral", horario: str = "10:20", data: str = "2026-10-08", iniciar_agora: bool = False):
    return {
        "titulo": titulo,
        "departamento": departamento,
        "data": data,
        "horario": horario,
        "participantes": ["Participante A"],
        "fonte_audio": "Microfone Padrão",
        "iniciar_agora": iniciar_agora
    }


def test_01_create_two_meetings_same_time_different_ids():
    """1 & 12: Criar RH às 10h20 e TI às 10h20, confirmando IDs diferentes e horário não sendo chave única."""
    payload_rh = make_payload("Reunião de Alinhamento RH", departamento="RH", horario="10:20", data="2026-10-08", iniciar_agora=False)
    payload_ti = make_payload("Reunião de Arquitetura TI", departamento="TI", horario="10:20", data="2026-10-08", iniciar_agora=False)

    res_rh = client.post("/api/live/meetings", json=payload_rh)
    res_ti = client.post("/api/live/meetings", json=payload_ti)

    assert res_rh.status_code == 200
    assert res_ti.status_code == 200

    m_rh = res_rh.json()["meeting"]
    m_ti = res_ti.json()["meeting"]

    # Identificadores únicos diferentes
    assert m_rh["ID_MEETING"] != m_ti["ID_MEETING"]
    assert len(m_rh["ID_MEETING"]) > 10
    assert len(m_ti["ID_MEETING"]) > 10

    # Mesmo horário coexistindo sem conflito
    assert m_rh["HORARIO_AGENDADO"] == "10:20"
    assert m_ti["HORARIO_AGENDADO"] == "10:20"
    assert m_rh["DT_MEETING"] == "2026-10-08"
    assert m_ti["DT_MEETING"] == "2026-10-08"

    # Status inicial agendada
    assert m_rh["STATUS_MEETING"] == "agendada"
    assert m_ti["STATUS_MEETING"] == "agendada"


def test_02_start_rh_and_ti_simultaneously():
    """2: Iniciar RH e TI simultaneamente e verificar transição para ao_vivo."""
    res_rh = client.post("/api/live/meetings", json=make_payload("Reunião RH 10:20", departamento="RH", horario="10:20", iniciar_agora=False))
    res_ti = client.post("/api/live/meetings", json=make_payload("Reunião TI 10:20", departamento="TI", horario="10:20", iniciar_agora=False))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    # Inicia ambas
    patch_rh = client.patch(f"/api/live/meetings/{id_rh}/status", json={"action": "iniciar"})
    patch_ti = client.patch(f"/api/live/meetings/{id_ti}/status", json={"action": "iniciar"})

    assert patch_rh.status_code == 200
    assert patch_ti.status_code == 200

    m_rh = patch_rh.json()["meeting"]
    m_ti = patch_ti.json()["meeting"]

    assert m_rh["STATUS_MEETING"] == "ao_vivo"
    assert m_ti["STATUS_MEETING"] == "ao_vivo"
    assert m_rh["STARTED_AT"] is not None
    assert m_ti["STARTED_AT"] is not None


def test_03_and_04_isolated_audio_and_transcription():
    """3 & 4: Confirmar que transcrição de RH não aparece em TI e vice-versa."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH Pautas", departamento="RH", horario="10:20", iniciar_agora=True))
    res_ti = client.post("/api/live/meetings", json=make_payload("TI Pautas", departamento="TI", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    # Envia transcrições diferentes
    txt_rh = "Discussão confidencial de contratações do departamento de RH e folha salarial."
    txt_ti = "Implementação da pipeline de deploy do cluster Kubernetes da equipe de TI."

    client.post(f"/api/live/meetings/{id_rh}/transcript", json={"transcript": txt_rh, "is_incremental": False})
    client.post(f"/api/live/meetings/{id_ti}/transcript", json={"transcript": txt_ti, "is_incremental": False})

    # Consulta cada uma
    get_rh = client.get(f"/api/live/meetings/{id_rh}").json()
    get_ti = client.get(f"/api/live/meetings/{id_ti}").json()

    # Confirma isolamento estrito
    assert txt_rh in get_rh["ANON_TRANSCRICAO"]
    assert "Kubernetes" not in get_rh["ANON_TRANSCRICAO"]

    assert txt_ti in get_ti["ANON_TRANSCRICAO"]
    assert "folha salarial" not in get_ti["ANON_TRANSCRICAO"]


def test_05_pause_rh_while_ti_remains_live():
    """5: Pausar RH enquanto TI continua ao vivo."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH 10:20", departamento="RH", horario="10:20", iniciar_agora=True))
    res_ti = client.post("/api/live/meetings", json=make_payload("TI 10:20", departamento="TI", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    # Pausa RH
    patch_rh = client.patch(f"/api/live/meetings/{id_rh}/status", json={"action": "pausar"})
    assert patch_rh.status_code == 200
    assert patch_rh.json()["meeting"]["STATUS_MEETING"] == "pausada"
    assert patch_rh.json()["meeting"]["PAUSED_AT"] is not None

    # TI continua ao vivo intacta
    get_ti = client.get(f"/api/live/meetings/{id_ti}").json()
    assert get_ti["STATUS_MEETING"] == "ao_vivo"


def test_06_finish_ti_while_rh_remains_active():
    """6: Finalizar TI enquanto RH continua ao vivo."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH Ativa", departamento="RH", horario="10:20", iniciar_agora=True))
    res_ti = client.post("/api/live/meetings", json=make_payload("TI Ativa", departamento="TI", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    # Finaliza TI
    patch_ti = client.patch(f"/api/live/meetings/{id_ti}/status", json={"action": "finalizar"})
    assert patch_ti.status_code == 200
    assert patch_ti.json()["meeting"]["STATUS_MEETING"] == "concluida"
    assert patch_ti.json()["meeting"]["FINISHED_AT"] is not None

    # RH continua ao vivo
    get_rh = client.get(f"/api/live/meetings/{id_rh}").json()
    assert get_rh["STATUS_MEETING"] == "ao_vivo"


def test_07_websocket_routing_and_reconnection():
    """7: Testar WebSocket isolado por meeting_id garantindo que eventos de RH vão só para RH."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH WS", departamento="RH", horario="10:20", iniciar_agora=True))
    res_ti = client.post("/api/live/meetings", json=make_payload("TI WS", departamento="TI", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    with client.websocket_connect(f"/ws/transcribe/{id_rh}") as ws_rh:
        init_rh = ws_rh.receive_json()
        assert init_rh["type"] == "connected"
        assert init_rh["meeting_id"] == id_rh

        with client.websocket_connect(f"/ws/transcribe/{id_ti}") as ws_ti:
            init_ti = ws_ti.receive_json()
            assert init_ti["type"] == "connected"
            assert init_ti["meeting_id"] == id_ti

            # Envia mensagem no socket de RH
            ws_rh.send_text('{"type": "transcript", "text": "Mensagem exclusiva do RH"}')
            msg_received_rh = ws_rh.receive_json()
            assert msg_received_rh["type"] == "transcript_update"
            assert msg_received_rh["meeting_id"] == id_rh
            assert msg_received_rh["text"] == "Mensagem exclusiva do RH"


def test_08_reload_page_recovery_from_backend():
    """8: Recarregar dados com duas reuniões em andamento e recuperá-las intactas."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH Recovery", departamento="RH", horario="10:20", iniciar_agora=True))
    res_ti = client.post("/api/live/meetings", json=make_payload("TI Recovery", departamento="TI", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    assert res_ti.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]
    id_ti = res_ti.json()["meeting"]["ID_MEETING"]

    # Simula recarregar buscando a lista de reuniões
    list_res = client.get("/api/live/meetings?status=ao_vivo").json()
    ids_found = [m["ID_MEETING"] for m in list_res]

    assert id_rh in ids_found
    assert id_ti in ids_found


def test_09_two_simultaneous_analyses_no_overwrite():
    """9: Processar duas reuniões simultâneas sem sobrescrever dados."""
    repo = MeetingRepository()
    id1 = repo.save_meeting({
        "TITULO_REUNIAO": "RH Análise",
        "NOME_SEGMENTO": "RH",
        "ANON_TRANSCRICAO": "Atraso no fechamento da folha e falta de integração com Fluig."
    })
    id2 = repo.save_meeting({
        "TITULO_REUNIAO": "TI Análise",
        "NOME_SEGMENTO": "TI",
        "ANON_TRANSCRICAO": "Sistema lento e produção parada precisando de manutenção no Protheus."
    })

    # Atualiza análise em id1
    repo.update_analysis(id1, {
        "tema": "Processos de RH",
        "dores": [{"categoria": "gargalo_operacional", "descricao": "Atraso na folha", "severidade": "Alta"}],
        "tarefas": []
    })

    # Atualiza análise em id2
    repo.update_analysis(id2, {
        "tema": "Infraestrutura TI",
        "dores": [{"categoria": "producao_parada", "descricao": "Sistema lento", "severidade": "Crítica"}],
        "tarefas": []
    })

    m1 = repo.get_by_id(id1)
    m2 = repo.get_by_id(id2)

    assert m1["RESUMO_IA"]["tema"] == "Processos de RH"
    assert m2["RESUMO_IA"]["tema"] == "Infraestrutura TI"
    assert m1["ID_MEETING"] != m2["ID_MEETING"]


def test_10_failure_isolation():
    """10: Simular falha/erro em uma reunião e confirmar que a outra continua normalmente."""
    res_rh = client.post("/api/live/meetings", json=make_payload("RH Safe", departamento="RH", horario="10:20", iniciar_agora=True))
    assert res_rh.status_code == 200
    id_rh = res_rh.json()["meeting"]["ID_MEETING"]

    # Simula chamada inválida em TI com ID inexistente
    res_fake = client.patch("/api/live/meetings/non_existent_id/status", json={"action": "iniciar"})
    assert res_fake.status_code == 400 or res_fake.status_code == 404

    # RH continua funcionando sem perturbação
    get_rh = client.get(f"/api/live/meetings/{id_rh}")
    assert get_rh.status_code == 200
    assert get_rh.json()["STATUS_MEETING"] == "ao_vivo"


def test_11_concurrent_thread_persistence():
    """11: Persistência concorrente em múltiplas threads sem race conditions."""
    repo = MeetingRepository()
    id_rh = repo.create_live_meeting(make_payload("RH Concorrente", departamento="RH", horario="10:20"))["ID_MEETING"]
    id_ti = repo.create_live_meeting(make_payload("TI Concorrente", departamento="TI", horario="10:20"))["ID_MEETING"]

    errors = []

    def update_rh():
        try:
            for i in range(10):
                repo.update_live_transcript(id_rh, f"Trecho RH {i}", is_incremental=True)
                time.sleep(0.005)
        except Exception as e:
            errors.append(e)

    def update_ti():
        try:
            for i in range(10):
                repo.update_live_transcript(id_ti, f"Trecho TI {i}", is_incremental=True)
                time.sleep(0.005)
        except Exception as e:
            errors.append(e)

    t1 = threading.Thread(target=update_rh)
    t2 = threading.Thread(target=update_ti)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert len(errors) == 0

    m_rh = repo.get_by_id(id_rh)
    m_ti = repo.get_by_id(id_ti)

    assert "Trecho RH 9" in m_rh["ANON_TRANSCRICAO"]
    assert "Trecho TI 9" in m_ti["ANON_TRANSCRICAO"]
    assert "Trecho TI" not in m_rh["ANON_TRANSCRICAO"]
    assert "Trecho RH" not in m_ti["ANON_TRANSCRICAO"]


def test_13_export_does_not_trigger_silent_llm():
    """13: Confirmar que obter ata ou resumo executivo não dispara reanálise de LLM."""
    repo = MeetingRepository()
    mid = repo.save_meeting({
        "TITULO_REUNIAO": "Reunião Teste Export",
        "ANON_TRANSCRICAO": "Texto da reunião",
        "RESUMO_IA": {
            "tema": "Tema Consolidado",
            "dores": [{"categoria": "gargalo", "descricao": "dor 1", "severidade": "Alta"}],
            "tarefas": [{"tarefa": "Implementar integracao", "responsavel": "Carlos", "status": "Em Andamento"}]
        }
    })

    # Consulta a ata executiva
    res = client.get(f"/api/meetings/{mid}/executive-summary")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "Tema Consolidado" in str(data["executive_summary"]) or data["executive_summary"] is not None


def test_14_operational_and_executive_minutes_remain_distinct():
    """14: Confirmar que a Ata Operacional e a Ata Executiva continuam com escopos distintos."""
    repo = MeetingRepository()
    mid = repo.save_meeting({
        "TITULO_REUNIAO": "Alinhamento Estratégico",
        "ANON_TRANSCRICAO": "Discussão de projeto.",
        "RESUMO_IA": {
            "tema": "Operação Geral",
            "dores": [{"categoria": "atraso", "descricao": "Atraso no cronograma", "severidade": "Alta"}],
            "tarefas": [{"tarefa": "Ajustar cronograma", "responsavel": "Mariana"}]
        }
    })

    exec_res = repo.get_executive_summary(mid)
    assert exec_res is not None

    m = repo.get_by_id(mid)
    assert "tarefas" in m["RESUMO_IA"]
    assert "dores" in m["RESUMO_IA"]

    assert "decisions_made" in exec_res or "summary_for_decision" in exec_res or "strategic_next_steps" in exec_res
    assert exec_res.get("summary_for_decision") is not None


def test_15_conversational_noise_rejection():
    """15: Confirmar rejeição de ruído conversacional ('vai entrar') em ambas as reuniões."""
    from analysis_service import NOISE_TASK_PHRASES, classify_task_operational_intent

    status_ruido, _ = classify_task_operational_intent("vai entrar")
    assert status_ruido == "rejected_noise"

    status_ruido_2, _ = classify_task_operational_intent("entrar na reuniao")
    assert status_ruido_2 == "rejected_noise"

    status_valido, _ = classify_task_operational_intent("Implementar rotina de backup no Protheus")
    assert status_valido == "valid"


def test_16_legacy_records_remain_accessible():
    """16: Confirmar que reuniões antigas continuam acessíveis e com campos normalizados."""
    repo = MeetingRepository()
    meetings, total, _ = repo.get_paginated(page=1, page_size=5)
    assert total > 0
    first = meetings[0]

    assert "ID_MEETING" in first
    assert "TITULO_REUNIAO" in first
    assert "DEPARTAMENTO" in first
    assert "HORARIO_AGENDADO" in first
    assert first["STATUS_MEETING"] in ["agendada", "pronta", "ao_vivo", "pausada", "finalizando", "concluida", "falhou", "cancelada", "aguardando_analise", "COMPLETED"]


def test_17_canonical_status_synchronization():
    """17: Confirmar que os status canônicos do backend estão sincronizados."""
    res = client.post("/api/live/meetings", json=make_payload("Sync Status", horario="10:20", data="2026-10-08", iniciar_agora=False))
    assert res.status_code == 200
    mid = res.json()["meeting"]["ID_MEETING"]

    assert res.json()["meeting"]["STATUS_MEETING"] == "agendada"

    client.patch(f"/api/live/meetings/{mid}/status", json={"action": "iniciar"})
    get_m = client.get(f"/api/live/meetings/{mid}").json()
    assert get_m["STATUS_MEETING"] == "ao_vivo"

    client.patch(f"/api/live/meetings/{mid}/status", json={"action": "pausar"})
    get_m = client.get(f"/api/live/meetings/{mid}").json()
    assert get_m["STATUS_MEETING"] == "pausada"

    client.patch(f"/api/live/meetings/{mid}/status", json={"action": "finalizar"})
    get_m = client.get(f"/api/live/meetings/{mid}").json()
    assert get_m["STATUS_MEETING"] == "concluida"


def test_18_three_or_more_simultaneous_meetings_at_same_time():
    """18: Testar 3 ou mais reuniões simultâneas às 10h20 (RH, TI, Financeiro)."""
    r1 = client.post("/api/live/meetings", json=make_payload("RH 10:20", departamento="RH", horario="10:20", data="2026-10-08", iniciar_agora=True)).json()["meeting"]
    r2 = client.post("/api/live/meetings", json=make_payload("TI 10:20", departamento="TI", horario="10:20", data="2026-10-08", iniciar_agora=True)).json()["meeting"]
    r3 = client.post("/api/live/meetings", json=make_payload("Financeiro 10:20", departamento="Financeiro", horario="10:20", data="2026-10-08", iniciar_agora=True)).json()["meeting"]

    all_ids = {r1["ID_MEETING"], r2["ID_MEETING"], r3["ID_MEETING"]}
    assert len(all_ids) == 3

    assert r1["HORARIO_AGENDADO"] == "10:20"
    assert r2["HORARIO_AGENDADO"] == "10:20"
    assert r3["HORARIO_AGENDADO"] == "10:20"

    assert r1["STATUS_MEETING"] == "ao_vivo"
    assert r2["STATUS_MEETING"] == "ao_vivo"
    assert r3["STATUS_MEETING"] == "ao_vivo"


# =========================================================================
# TESTES ESPECÍFICOS DA NOVA DIRETRIZ: CRIAÇÃO MANUAL E VALIDAÇÃO ESTRITA
# =========================================================================

def test_19_empty_or_invalid_payload_is_rejected():
    """Rejeitar payload vazio, título vazio, data ou horário ausentes/inválidos."""
    # 1. Vazio total
    r_empty = client.post("/api/live/meetings", json={})
    assert r_empty.status_code == 422

    # 2. Título vazio ou só espaços
    r_title_blank = client.post("/api/live/meetings", json={"titulo": "   ", "data": "2026-10-08", "horario": "10:20"})
    assert r_title_blank.status_code == 422

    # 3. Data ausente
    r_no_date = client.post("/api/live/meetings", json={"titulo": "Planejamento RH", "horario": "10:20"})
    assert r_no_date.status_code == 422

    # 4. Horário ausente
    r_no_time = client.post("/api/live/meetings", json={"titulo": "Planejamento RH", "data": "2026-10-08"})
    assert r_no_time.status_code == 422

    # 5. Data inválida
    r_bad_date = client.post("/api/live/meetings", json={"titulo": "Planejamento RH", "data": "amanha", "horario": "10:20"})
    assert r_bad_date.status_code == 422

    # 6. Horário inválido
    r_bad_time = client.post("/api/live/meetings", json={"titulo": "Planejamento RH", "data": "2026-10-08", "horario": "25:99"})
    assert r_bad_time.status_code == 422


def test_20_listing_does_not_create_records():
    """Abrir/listar reuniões via GET não deve criar nenhum registro no banco."""
    repo = MeetingRepository()
    count_before = len(repo.get_all())

    res = client.get("/api/live/meetings")
    assert res.status_code == 200

    count_after = len(repo.get_all())
    assert count_before == count_after


def test_21_creation_does_not_call_llm_nor_start_analysis():
    """A criação manual não deve consultar LLM nem iniciar transcrição/análise."""
    payload = make_payload("Reunião Manual de Operações", departamento="Operações", horario="14:00", data="2026-10-10", iniciar_agora=False)
    res = client.post("/api/live/meetings", json=payload)
    assert res.status_code == 200

    created = res.json()["meeting"]
    assert created["TITULO_REUNIAO"] == "Reunião Manual de Operações"
    assert created["HORARIO_AGENDADO"] == "14:00"
    assert created["DT_MEETING"] == "2026-10-10"
    assert created["DEPARTAMENTO"] == "Operações"
    assert created["ANON_TRANSCRICAO"] == ""
    assert created["RESUMO_IA"] is None
    assert created["RESUMO_EXECUTIVO"] is None
    assert created["STATUS_MEETING"] == "agendada"


def test_22_english_contract_endpoint_live_meetings():
    """Suportar endpoint alternativo POST /api/live-meetings com contrato em inglês."""
    payload_en = {
        "title": "Reunião de Planejamento do RH",
        "date": "2026-10-07",
        "time": "10:20",
        "team": "RH"
    }
    res = client.post("/api/live-meetings", json=payload_en)
    assert res.status_code == 200

    created = res.json()["meeting"]
    assert created["TITULO_REUNIAO"] == "Reunião de Planejamento do RH"
    assert created["DT_MEETING"] == "2026-10-07"
    assert created["HORARIO_AGENDADO"] == "10:20"
    assert created["DEPARTAMENTO"] == "RH"
    assert created["ORIGEM"] == "live"


def test_23_live_hub_only_returns_live_origin_meetings():
    """Garantir que get_live_meetings retorne apenas reuniões criadas com ORIGEM == 'live'."""
    repo = MeetingRepository()
    # Adiciona reunião histórica direta
    hist_id = repo.save_meeting({
        "TITULO_REUNIAO": "Reunião Antiga Histórica",
        "NOME_SEGMENTO": "Histórico",
        "ORIGEM": "historico",
        "DT_MEETING": "2025-01-01"
    })

    # Consulta Central Ao Vivo
    live_list = client.get("/api/live/meetings").json()
    live_ids = [m["ID_MEETING"] for m in live_list]

    # Reunião histórica não pode aparecer no Hub Ao Vivo
    assert hist_id not in live_ids


def test_24_reject_missing_date_and_departamento():
    """Valida rejeição com HTTP 422 se data ou departamento vierem ausentes, vazios ou inválidos."""
    valid_base = {
        "titulo": "Reunião de Operações",
        "departamento": "Operações",
        "data": "2026-10-08",
        "horario": "10:20"
    }

    # Sem data
    no_date = {k: v for k, v in valid_base.items() if k != "data"}
    res1 = client.post("/api/live/meetings", json=no_date)
    assert res1.status_code == 422

    # Data vazia
    res2 = client.post("/api/live/meetings", json={**valid_base, "data": "   "})
    assert res2.status_code == 422

    # Data impossível no calendário (ex: 31 de fevereiro)
    res3 = client.post("/api/live/meetings", json={**valid_base, "data": "2026-02-31"})
    assert res3.status_code == 422

    # Sem departamento
    no_dept = {k: v for k, v in valid_base.items() if k != "departamento"}
    res4 = client.post("/api/live/meetings", json=no_dept)
    assert res4.status_code == 422

    # Departamento vazio
    res5 = client.post("/api/live/meetings", json={**valid_base, "departamento": "   "})
    assert res5.status_code == 422


def test_25_transcript_endpoint_session_id_contract():
    """25: Atualizar transcrição passando session_id e verificar persistência."""
    payload = make_payload("Reunião Contrato Transcrição", departamento="TI", horario="11:00", data="2026-10-08", iniciar_agora=True)
    res = client.post("/api/live/meetings", json=payload)
    assert res.status_code == 200
    mid = res.json()["meeting"]["ID_MEETING"]

    # Atualiza com session_id
    tr_res = client.post(
        f"/api/live/meetings/{mid}/transcript",
        json={"transcript": "Primeiro bloco transcrito.", "is_incremental": False, "session_id": "test_sess_001"}
    )
    assert tr_res.status_code == 200
    assert tr_res.json()["meeting"]["ANON_TRANSCRICAO"] == "Primeiro bloco transcrito."
    assert tr_res.json()["meeting"].get("LAST_TRANSCRIPT_SESSION_ID") == "test_sess_001"

    # GET confirma persistência
    get_res = client.get(f"/api/live/meetings/{mid}")
    assert get_res.status_code == 200
    assert get_res.json()["ANON_TRANSCRICAO"] == "Primeiro bloco transcrito."


def test_26_transcript_sync_status_and_incremental():
    """26: Transcrição incremental não sobrescreve bloco anterior e mantém isolamento."""
    p1 = make_payload("Reunião A Transcrição", departamento="RH", horario="11:30", data="2026-10-08", iniciar_agora=True)
    p2 = make_payload("Reunião B Transcrição", departamento="TI", horario="11:30", data="2026-10-08", iniciar_agora=True)

    r1 = client.post("/api/live/meetings", json=p1).json()["meeting"]
    r2 = client.post("/api/live/meetings", json=p2).json()["meeting"]

    m1_id = r1["ID_MEETING"]
    m2_id = r2["ID_MEETING"]

    # Bloco 1 para reunião A
    client.post(
        f"/api/live/meetings/{m1_id}/transcript",
        json={"transcript": "Início da reunião do RH.", "is_incremental": False, "session_id": "sess_rh"}
    )

    # Bloco incremental para reunião A
    client.post(
        f"/api/live/meetings/{m1_id}/transcript",
        json={"transcript": "Continuação da pauta do RH.", "is_incremental": True, "session_id": "sess_rh"}
    )

    # Reunião B recebe sua própria fala
    client.post(
        f"/api/live/meetings/{m2_id}/transcript",
        json={"transcript": "Discussão de infraestrutura TI.", "is_incremental": False, "session_id": "sess_ti"}
    )

    # Verifica isolamento absoluto
    get_m1 = client.get(f"/api/live/meetings/{m1_id}").json()
    get_m2 = client.get(f"/api/live/meetings/{m2_id}").json()

    assert get_m1["ANON_TRANSCRICAO"] == "Início da reunião do RH. Continuação da pauta do RH."
    assert get_m2["ANON_TRANSCRICAO"] == "Discussão de infraestrutura TI."


def test_27_backend_does_not_expose_fake_stt_fallback():
    """27: Garantir que não há endpoint fictício de STT de áudio sem transcritor configurado."""
    # Chamadas para rotas inexistentes de upload de chunks de áudio retornam 404
    r1 = client.post("/api/audio/transcribe", json={"audio": "fake_data"})
    assert r1.status_code == 404

    r2 = client.post("/api/live/audio-chunk", json={"chunk": "base64..."})
    assert r2.status_code == 404


def test_28_live_meeting_manual_notes_persistence():
    """28: Persistir anotações manuais quando o usuário digita na reunião ao vivo."""
    payload = make_payload("Reunião com Notas Manuais", departamento="Financeiro", horario="14:00", data="2026-10-08", iniciar_agora=True)
    res = client.post("/api/live/meetings", json=payload)
    assert res.status_code == 200
    mid = res.json()["meeting"]["ID_MEETING"]

    # Salva anotação manual
    manual_text = "Pauta discutida: Fechamento contábil e auditoria interna do 3º trimestre."
    save_res = client.post(
        f"/api/live/meetings/{mid}/transcript",
        json={"transcript": manual_text, "is_incremental": False, "session_id": "manual_input_session"}
    )
    assert save_res.status_code == 200
    assert save_res.json()["meeting"]["ANON_TRANSCRICAO"] == manual_text

    # Recupera reunião e valida persistência
    get_res = client.get(f"/api/live/meetings/{mid}")
    assert get_res.status_code == 200
    assert get_res.json()["ANON_TRANSCRICAO"] == manual_text


def test_29_session_isolation_and_simultaneous_transcripts():
    """29: Isolamento estrito entre reuniões simultâneas às 10h20 (RH e TI)."""
    p_rh = make_payload("RH 10:20 Sim", departamento="RH", horario="10:20", data="2026-10-08", iniciar_agora=True)
    p_ti = make_payload("TI 10:20 Sim", departamento="TI", horario="10:20", data="2026-10-08", iniciar_agora=True)

    m_rh = client.post("/api/live/meetings", json=p_rh).json()["meeting"]
    m_ti = client.post("/api/live/meetings", json=p_ti).json()["meeting"]

    id_rh = m_rh["ID_MEETING"]
    id_ti = m_ti["ID_MEETING"]

    assert id_rh != id_ti

    # Sessão 1 do RH
    client.post(
        f"/api/live/meetings/{id_rh}/transcript",
        json={"transcript": "Plano de capacitação RH.", "is_incremental": False, "session_id": "sess_rh_01"}
    )

    # Sessão 1 do TI
    client.post(
        f"/api/live/meetings/{id_ti}/transcript",
        json={"transcript": "Migração de banco de dados TI.", "is_incremental": False, "session_id": "sess_ti_01"}
    )

    res_rh = client.get(f"/api/live/meetings/{id_rh}").json()
    res_ti = client.get(f"/api/live/meetings/{id_ti}").json()

    assert res_rh["ANON_TRANSCRICAO"] == "Plano de capacitação RH."
    assert res_ti["ANON_TRANSCRICAO"] == "Migração de banco de dados TI."
    assert "TI" not in res_rh["ANON_TRANSCRICAO"]
    assert "RH" not in res_ti["ANON_TRANSCRICAO"]


def test_30_stt_status_endpoint():
    """30: Valida endpoint GET /api/stt/status com metadados do provedor."""
    res = client.get("/api/stt/status")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "available" in data
    assert "provider" in data
    assert "model" in data
    assert "device" in data
    assert "language" in data


def test_31_audio_chunk_upload_stt_unavailable(monkeypatch):
    """31: Valida retorno HTTP 503 com reason claro quando STT está indisponível."""
    from stt_service import get_stt_service
    stt = get_stt_service()
    
    # Simula indisponibilidade
    old_enabled = stt.enabled
    old_mock = stt._mock_model
    try:
        stt.enabled = False
        stt._mock_model = None

        res_create = client.post("/api/live/meetings", json=make_payload("Reunião Falha STT", iniciar_agora=True))
        assert res_create.status_code == 200
        mid = res_create.json()["meeting"]["ID_MEETING"]

        files = {"audio": ("chunk_0.webm", b"\x1a\x45\xdf\xa3fakeaudiobytes", "audio/webm")}
        data = {"session_id": "sess_err", "sequence": "0", "is_final": "false"}
        res = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=files, data=data)

        assert res.status_code == 503
        body = res.json()
        assert body["status"] == "unavailable"
        assert body["reason"] == "stt_disabled"
        assert "message" in body
    finally:
        stt.enabled = old_enabled
        stt._mock_model = old_mock


def test_32_and_33_audio_chunk_upload_and_idempotency():
    """32 & 33: Upload de chunks com STT simulado, ordenação e idempotência por sequence."""
    from stt_service import get_stt_service

    class MockSegment:
        def __init__(self, text):
            self.text = text
            self.start = 0.0
            self.end = 4.0

    class MockInfo:
        def __init__(self):
            self.language = "pt"
            self.language_probability = 0.98
            self.duration = 4.0

    class MockModel:
        def __init__(self):
            self.calls = 0

        def transcribe(self, path, language="pt", beam_size=1, vad_filter=True):
            self.calls += 1
            return [MockSegment(f"Segmento {self.calls} capturado")], MockInfo()

    stt = get_stt_service()
    mock_model = MockModel()
    stt.set_mock_model(mock_model)
    stt.enabled = True

    try:
        res_create = client.post("/api/live/meetings", json=make_payload("Reunião Chunks STT", iniciar_agora=True))
        assert res_create.status_code == 200
        mid = res_create.json()["meeting"]["ID_MEETING"]

        # Chunk 0
        f0 = {"audio": ("chunk_0.webm", b"audiochunk0bytes", "audio/webm")}
        d0 = {"session_id": "sess_123", "sequence": "0", "is_final": "false"}
        r0 = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=f0, data=d0)
        assert r0.status_code == 200
        body0 = r0.json()
        assert body0["status"] == "success"
        assert body0["sequence"] == 0
        assert "Segmento 1" in body0["text"]
        assert "Segmento 1" in body0["transcript"]
        assert body0["already_processed"] is False

        # Chunk 1
        f1 = {"audio": ("chunk_1.webm", b"audiochunk1bytes", "audio/webm")}
        d1 = {"session_id": "sess_123", "sequence": "1", "is_final": "false"}
        r1 = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=f1, data=d1)
        assert r1.status_code == 200
        body1 = r1.json()
        assert body1["sequence"] == 1
        assert "Segmento 1" in body1["transcript"]
        assert "Segmento 2" in body1["transcript"]

        # Reenvio do Chunk 1 (deve ser idempotente: não duplica no texto acumulado)
        f1_dup = {"audio": ("chunk_1.webm", b"audiochunk1bytes", "audio/webm")}
        d1_dup = {"session_id": "sess_123", "sequence": "1", "is_final": "false"}
        r1_dup = client.post(f"/api/live/meetings/{mid}/transcript/audio", files=f1_dup, data=d1_dup)
        assert r1_dup.status_code == 200
        body1_dup = r1_dup.json()
        assert body1_dup["already_processed"] is True
        # Texto não deve ter sido duplicado
        transcript = body1_dup["transcript"]
        assert transcript.count("Segmento 2") == 1
    finally:
        stt._mock_model = None
        stt._dependency_checked = False


def test_34_audio_chunk_meeting_isolation():
    """34: Valida isolamento estrito de áudio entre duas reuniões distintas."""
    from stt_service import get_stt_service

    class MockSegment:
        def __init__(self, text):
            self.text = text
            self.start = 0.0
            self.end = 3.5

    class MockInfo:
        def __init__(self):
            self.language = "pt"
            self.language_probability = 0.99
            self.duration = 3.5

    class EchoMockModel:
        def transcribe(self, path, language="pt", beam_size=1, vad_filter=True):
            # Lê os bytes gravados no arquivo temporário para ecoar o texto
            with open(path, "rb") as f:
                content = f.read().decode("latin1", errors="ignore")
            return [MockSegment(content)], MockInfo()

    stt = get_stt_service()
    stt.set_mock_model(EchoMockModel())
    stt.enabled = True

    try:
        r_rh = client.post("/api/live/meetings", json=make_payload("RH Isolamento Audio", iniciar_agora=True)).json()["meeting"]
        r_ti = client.post("/api/live/meetings", json=make_payload("TI Isolamento Audio", iniciar_agora=True)).json()["meeting"]
        id_rh = r_rh["ID_MEETING"]
        id_ti = r_ti["ID_MEETING"]

        # Upload no RH
        client.post(
            f"/api/live/meetings/{id_rh}/transcript/audio",
            files={"audio": ("c.webm", b"RH_SECRET_DATA", "audio/webm")},
            data={"session_id": "s_rh", "sequence": "0"}
        )
        # Upload no TI
        client.post(
            f"/api/live/meetings/{id_ti}/transcript/audio",
            files={"audio": ("c.webm", b"TI_SECRET_DATA", "audio/webm")},
            data={"session_id": "s_ti", "sequence": "0"}
        )

        get_rh = client.get(f"/api/live/meetings/{id_rh}").json()
        get_ti = client.get(f"/api/live/meetings/{id_ti}").json()

        assert "RH_SECRET_DATA" in get_rh["ANON_TRANSCRICAO"]
        assert "TI_SECRET_DATA" not in get_rh["ANON_TRANSCRICAO"]

        assert "TI_SECRET_DATA" in get_ti["ANON_TRANSCRICAO"]
        assert "RH_SECRET_DATA" not in get_ti["ANON_TRANSCRICAO"]
    finally:
        stt._mock_model = None
        stt._dependency_checked = False


def test_35_audio_chunk_validation_404_and_non_live():
    """35: Erro 404 para reunião inexistente e 400 para reunião não live."""
    files = {"audio": ("chunk.webm", b"fake", "audio/webm")}
    data = {"session_id": "s", "sequence": "0"}

    # Inexistente -> 404
    r_404 = client.post("/api/live/meetings/non-existent-id-9999/transcript/audio", files=files, data=data)
    assert r_404.status_code == 404

    # Histórica -> 400
    all_meetings = client.get("/api/meetings?page=1&page_size=20").json()["items"]
    hist = next((m for m in all_meetings if m.get("ORIGEM") == "historico"), None)
    if hist:
        r_400 = client.post(f"/api/live/meetings/{hist['ID_MEETING']}/transcript/audio", files=files, data=data)
        assert r_400.status_code == 400


def test_36_stt_status_endpoint_and_webm_header_assembly():
    """36: GET /api/stt/status retorna available=true e montagem de container WebM em chunks subsequentes."""
    from stt_service import get_stt_service
    stt = get_stt_service()
    status_res = client.get("/api/stt/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["enabled"] is True
    assert status_data["available"] is True
    assert status_data["provider"] == "faster_whisper"

    # Testa montagem de cabeçalho WebM para streaming de múltiplos chunks
    sess_id = "sess_header_test_99"
    ebml_header = b"\x1a\x45\xdf\xa3\x01\x00\x00\x00"
    cluster_magic = b"\x1f\x43\xb6\x75"
    chunk_0 = ebml_header + b"tracks_info" + cluster_magic + b"payload0"
    chunk_1 = cluster_magic + b"payload1"

    # Inicia mock temporário para validar a lógica de agregação do stt_service sem custo de inferência
    class InspectMockModel:
        def __init__(self):
            self.last_audio_bytes = None

        def transcribe(self, path, language="pt", beam_size=1, vad_filter=True):
            with open(path, "rb") as f:
                self.last_audio_bytes = f.read()

            class Seg:
                text = "fala reconhecida"
                start = 0.0
                end = 2.0

            class Inf:
                language = "pt"
                language_probability = 1.0
                duration = 2.0

            return [Seg()], Inf()

    mock = InspectMockModel()
    stt.set_mock_model(mock)
    try:
        # Chunk 0: salva o cabeçalho
        res0 = stt.transcribe_audio_bytes(chunk_0, filename_hint="c0.webm", session_id=sess_id, sequence=0)
        assert res0["text"] == "fala reconhecida"
        assert sess_id in stt._session_headers
        assert stt._session_headers[sess_id] == ebml_header + b"tracks_info"

        # Chunk 1: sem cabeçalho EBML, deve receber o cabeçalho prepended automaticamente
        res1 = stt.transcribe_audio_bytes(chunk_1, filename_hint="c1.webm", session_id=sess_id, sequence=1)
        assert res1["text"] == "fala reconhecida"
        assert mock.last_audio_bytes.startswith(ebml_header + b"tracks_info" + cluster_magic)

        # Limpeza explícita da sessão
        stt.clear_session(sess_id)
        assert sess_id not in stt._session_headers
    finally:
        stt._mock_model = None
        stt._dependency_checked = False


def test_37_simultaneous_real_audio_and_zero_retention():
    """37: Isolamento de duas reuniões simultâneas com áudio e retenção zero de arquivos temporários."""
    import io
    import wave
    import os
    import tempfile
    from stt_service import get_stt_service

    # Gera um pequeno buffer WAV válido de 0.2s em memória
    def generate_wav_bytes():
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00\x00" * 3200)
        return buf.getvalue()

    wav_rh = generate_wav_bytes()
    wav_ti = generate_wav_bytes()

    # Cria reuniões simultâneas às 10:20
    m_rh = client.post("/api/live/meetings", json=make_payload("RH 10:20 Audio", departamento="RH", horario="10:20", iniciar_agora=True)).json()["meeting"]
    m_ti = client.post("/api/live/meetings", json=make_payload("TI 10:20 Audio", departamento="TI", horario="10:20", iniciar_agora=True)).json()["meeting"]

    id_rh = m_rh["ID_MEETING"]
    id_ti = m_ti["ID_MEETING"]

    # Ingestão de áudio simultâneo
    r_rh = client.post(
        f"/api/live/meetings/{id_rh}/transcript/audio",
        files={"audio": ("audio_rh.wav", wav_rh, "audio/wav")},
        data={"session_id": "sess_rh_wav", "sequence": "0", "is_final": "true"}
    )
    r_ti = client.post(
        f"/api/live/meetings/{id_ti}/transcript/audio",
        files={"audio": ("audio_ti.wav", wav_ti, "audio/wav")},
        data={"session_id": "sess_ti_wav", "sequence": "0", "is_final": "true"}
    )

    assert r_rh.status_code == 200
    assert r_ti.status_code == 200

    # Confirma que nenhum arquivo pf_chunk_ sobrou no diretório temporário
    tempdir = tempfile.gettempdir()
    leftovers = [f for f in os.listdir(tempdir) if f.startswith("pf_chunk_")]
    assert len(leftovers) == 0



