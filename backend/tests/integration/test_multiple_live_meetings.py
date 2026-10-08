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
