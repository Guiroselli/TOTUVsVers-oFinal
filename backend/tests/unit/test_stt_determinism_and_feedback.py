"""
Testes automatizados cobrindo:
1. Diagnóstico e métricas de sinal de áudio (analyze_audio_signal)
2. Consolidação de chunks com deduplicação de borda e ordenação (ChunkConsolidator)
3. Vocabulário corporativo ("reunião", "Proton Flow", "TOTVS") e configuração determinística
4. Determinismo do Ollama e cache de análise por SHA256 (AnalysisService)
5. Bloqueio de resumo factual para transcrições vazias / insuficientes (< 15 caracteres)
6. Validação estrita de evidências textuais e descarte de alucinações (rejected_hallucinations_audit)
7. Feedback humano auditável (confirmed, edited, rejected, marked_noise)
8. Isolamento estrito entre múltiplas reuniões simultâneas (RH vs TI)
"""

import os
import sys
import math
import struct
import io
import wave
import pytest
import tempfile
from unittest.mock import MagicMock, patch

_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.abspath(os.path.join(_current_dir, "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from consolidation import ChunkConsolidator, detect_border_overlap, filter_conversational_noise
from stt_service import analyze_audio_signal, STTService, STT_INITIAL_PROMPT
from analysis_service import AnalysisService, check_evidence_in_transcript
from repositories import MeetingRepository
from schemas import ItemReviewRequest


def _generate_wav_signal(amplitude=10000, duration_sec=0.2, freq=440.0, sample_rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        num_frames = int(sample_rate * duration_sec)
        frames = bytearray()
        for i in range(num_frames):
            val = int(amplitude * math.sin(2 * math.pi * freq * (i / sample_rate)))
            frames.extend(struct.pack("<h", max(-32768, min(32767, val))))
        wf.writeframes(frames)
    return buf.getvalue()


# -------------------------------------------------------------
# 1. Análise de Sinal de Áudio
# -------------------------------------------------------------
def test_audio_signal_analysis_silence():
    silent_wav = _generate_wav_signal(amplitude=0, duration_sec=0.1)
    diag = analyze_audio_signal(silent_wav, "chunk_silence.wav")
    assert diag["audio_level"] <= 1.0
    assert diag["speech_detected"] is False
    assert diag["signal_quality"] == "sem_fala"


def test_audio_signal_analysis_sufficient():
    speech_wav = _generate_wav_signal(amplitude=8000, duration_sec=0.2)
    diag = analyze_audio_signal(speech_wav, "chunk_speech.wav")
    assert diag["audio_level"] >= 10.0
    assert diag["speech_detected"] is True
    assert diag["signal_quality"] == "suficiente"


def test_audio_signal_analysis_saturated():
    saturated_wav = _generate_wav_signal(amplitude=32000, duration_sec=0.2)
    diag = analyze_audio_signal(saturated_wav, "chunk_loud.wav")
    assert diag["audio_level"] >= 80.0
    assert diag["signal_quality"] in ("suficiente", "saturado")


# -------------------------------------------------------------
# 2. Consolidação de Chunks e Deduplicação de Borda
# -------------------------------------------------------------
def test_border_overlap_detection():
    prev = "Esta é uma reunião do Proton Flow"
    nxt = "Proton Flow precisamos definir o responsável"
    overlap = detect_border_overlap(prev, nxt)
    assert overlap == "precisamos definir o responsável"

    # Sem overlap
    prev_no = "A equipe de tecnologia"
    nxt_no = "vai fazer o deploy amanhã"
    assert detect_border_overlap(prev_no, nxt_no) == "vai fazer o deploy amanhã"


def test_chunk_consolidator_ordering_and_deduplication():
    consolidator = ChunkConsolidator()
    chunks = [
        {"sequence": 1, "text": "Proton Flow precisamos definir a meta."},
        {"sequence": 0, "text": "Esta é uma reunião do Proton Flow"},
    ]
    res = consolidator.consolidate(chunks)
    assert "Esta é uma reunião do Proton Flow" in res["transcript_raw"]
    # Verifica que não duplicou "Proton Flow" na borda consolidada
    assert "Proton Flow Proton Flow" not in res["transcript_normalized"]
    assert "meta" in res["transcript_normalized"]


def test_filter_conversational_noise():
    dirty = "hum vamos definir o prazo [ruído] da tarefa né"
    cleaned, audit = filter_conversational_noise(dirty)
    assert "hum" not in cleaned
    assert "[ruído]" not in cleaned
    assert "definir o prazo" in cleaned
    assert len(audit) > 0


# -------------------------------------------------------------
# 3. Prompt Corporativo e Reconhecimento da Palavra "reunião"
# -------------------------------------------------------------
def test_stt_corporate_prompt_includes_reuniao_and_totvs():
    assert "reunião" in STT_INITIAL_PROMPT
    assert "Proton Flow" in STT_INITIAL_PROMPT
    assert "TOTVS" in STT_INITIAL_PROMPT
    assert "ata operacional" in STT_INITIAL_PROMPT
    assert "RH" in STT_INITIAL_PROMPT
    assert "TI" in STT_INITIAL_PROMPT


def test_stt_vad_parameters_speech_pad():
    stt = STTService()
    assert "speech_pad_ms" in stt.vad_parameters
    assert stt.vad_parameters["speech_pad_ms"] >= 300
    assert stt.language == "pt"


# -------------------------------------------------------------
# 4. Inferência Determinística e Cache por SHA256
# -------------------------------------------------------------
def test_ollama_deterministic_options():
    service = AnalysisService()
    opts = service.get_deterministic_options()
    assert opts["temperature"] == 0.0
    assert opts["top_k"] == 1
    assert opts["top_p"] == 1.0
    assert opts["seed"] == 42


def test_analysis_input_hash_caching():
    import json
    service = AnalysisService()
    transcript = "Esta é uma reunião do Proton Flow. Vamos revisar os benefícios da equipe."
    hash1 = service.compute_input_hash(transcript)
    hash2 = service.compute_input_hash(transcript)
    assert hash1 == hash2

    # Mock response from Ollama
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "response": json.dumps({
            "tema": "Revisão de Benefícios",
            "resumo_executivo": {
                "situacao": "Alinhamento",
                "impacto": "Geral",
                "riscos": "Nenhum",
                "decisoes": ["Benefícios serão revisados"]
            },
            "tarefas": [
                {
                    "tarefa": "Revisar benefícios",
                    "responsavel": "RH",
                    "prazo": "amanhã",
                    "evidence": "revisar os benefícios da equipe",
                    "prioridade": "Média"
                }
            ],
            "dores": [],
            "decisoes": ["Benefícios serão revisados"]
        })
    }

    with patch("requests.post", return_value=mock_resp):
        res1 = service.analyze(transcript)
        assert res1.analise_metadados.cache_hit is False

        # Segunda chamada com mesmo texto -> CACHE HIT imediato sem chamar requests.post
        res2 = service.analyze(transcript)
        assert res2.analise_metadados.cache_hit is True
        assert res2.analise_metadados.input_hash == hash1


# -------------------------------------------------------------
# 5. Bloqueio de Resumo Factual para Transcrição Vazia / Insuficiente
# -------------------------------------------------------------
def test_empty_or_short_transcript_blocks_factual_summary():
    service = AnalysisService()
    # Transcrição com menos de 15 caracteres significativos
    res_empty = service.analyze("olá teste")
    assert res_empty.analise_metadados.status == "insufficient_data"
    assert "Não há transcrição suficiente" in res_empty.tema
    assert len(res_empty.tarefas) == 0
    assert len(res_empty.dores) == 0
    assert res_empty.contexto.decisao in ("Não mencionado", "Não identificado")


# -------------------------------------------------------------
# 6. Validação Estrita de Evidências Contra a Transcrição
# -------------------------------------------------------------
def test_evidence_validation_against_transcript():
    transcript = "O time de tecnologia vai fazer o deploy amanhã no cluster de Kubernetes."
    
    # Evidência contida no texto
    valid, score = check_evidence_in_transcript("deploy amanhã no cluster", transcript)
    assert valid is True

    # Evidência alucinada que não existe
    valid_false, score_false = check_evidence_in_transcript("compra de novo servidor IBM", transcript)
    assert valid_false is False


def test_hallucinated_items_dropped_to_audit():
    import json
    service = AnalysisService()
    transcript = "Esta é uma reunião do Proton Flow. Definimos o responsável pela documentação."
    
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "response": json.dumps({
            "tema": "Reunião de Documentação",
            "resumo_executivo": {
                "situacao": "Alinhamento",
                "impacto": "Geral",
                "riscos": "Nenhum",
                "decisoes": ["Documentação será definida"]
            },
            "tarefas": [
                {
                    "tarefa": "Definir responsável pela documentação",
                    "responsavel": "Equipe",
                    "prazo": "Não mencionado",
                    "evidence": "responsável pela documentação",
                    "prioridade": "Média"
                },
                {
                    "tarefa": "Contratar 50 novos desenvolvedores em Java",
                    "responsavel": "Diretoria",
                    "prazo": "2026-12-31",
                    "evidence": "contratação imediata de 50 seniores",
                    "prioridade": "Crítica"
                }
            ],
            "dores": [],
            "decisoes": ["Documentação será definida"]
        })
    }

    with patch("requests.post", return_value=mock_resp):
        result = service.analyze(transcript)
        # Item válido é mantido
        assert len(result.tarefas) == 1
        assert "documentação" in result.tarefas[0].tarefa.lower()

        # Item alucinado foi descartado para o log de auditoria
        audit = result.analise_metadados.rejected_hallucinations_audit
        assert len(audit) >= 1
        assert audit[0]["tipo"] == "tarefa_sem_evidencia"
        assert "Contratar 50" in audit[0]["tarefa"]


# -------------------------------------------------------------
# 7. Feedback Humano Auditável (Confirmar, Editar, Rejeitar, Ruído)
# -------------------------------------------------------------
def test_human_feedback_actions():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tf.write(b"[]")
        tf_path = tf.name

    try:
        repo = MeetingRepository(dataset_path=tf_path)
        meeting = repo.create_live_meeting({
            "titulo": "Alinhamento TI",
            "departamento": "TI",
            "horario": "10:20",
            "data": "2026-10-10"
        })
        meeting_id = meeting["ID_MEETING"]

        # Inicializa com resumo contendo tarefas e dores
        repo.update_analysis(meeting_id, {
            "tarefas": [
                {"tarefa": "Fazer deploy", "responsavel": "TI", "prazo": "amanhã", "evidence": "deploy amanhã"}
            ],
            "dores": [
                {"label": "Lentidão no build", "severidade": "Alta", "trecho": "build lento"}
            ]
        })

        # 1. Confirmação de Tarefa
        req_confirm = ItemReviewRequest(
            item_id=0,
            action="confirmed",
            reviewer="lucas_lead",
            reason="Aprovado sem alterações"
        )
        res_task = repo.update_task_review(
            meeting_id=meeting_id,
            task_index=req_confirm.item_id,
            action=req_confirm.action,
            reason=req_confirm.reason,
            reviewer=req_confirm.reviewer
        )
        assert res_task["tarefa"]["review_status"] == "confirmed"

        # 2. Edição de Tarefa
        req_edit = ItemReviewRequest(
            item_id=0,
            action="edited",
            reviewer="lucas_lead",
            edited_payload={"responsavel": "Carlos", "prazo": "sexta-feira"},
            reason="Ajuste de dono e data"
        )
        res_edit = repo.update_task_review(
            meeting_id=meeting_id,
            task_index=req_edit.item_id,
            action=req_edit.action,
            custom_task=req_edit.edited_payload,
            reason=req_edit.reason,
            reviewer=req_edit.reviewer
        )
        assert res_edit["tarefa"]["responsavel"] == "Carlos"
        assert res_edit["tarefa"]["prazo"] == "sexta-feira"
        assert res_edit["tarefa"]["review_status"] == "edited"

        # 3. Rejeição de Dor
        req_reject = ItemReviewRequest(
            item_id=0,
            action="rejected",
            reviewer="lucas_lead",
            reason="Não é um gargalo real"
        )
        res_pain = repo.update_pain_review(
            meeting_id=meeting_id,
            pain_index=req_reject.item_id,
            action=req_reject.action,
            reason=req_reject.reason,
            reviewer=req_reject.reviewer
        )
        assert res_pain["dor"]["review_status"] == "rejected"

        # Verifica o log de auditoria completo
        history = repo.get_feedback_history(meeting_id)
        assert len(history) == 3
        assert history[0]["action"] == "confirmed"
        assert history[1]["action"] == "edited"
        assert history[2]["action"] == "rejected"
    finally:
        if os.path.exists(tf_path):
            os.remove(tf_path)


# -------------------------------------------------------------
# 8. Preservação de Isolamento entre Reuniões Simultâneas (RH vs TI)
# -------------------------------------------------------------
def test_multi_meeting_strict_isolation_rh_and_ti():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tf.write(b"[]")
        tf_path = tf.name

    try:
        repo = MeetingRepository(dataset_path=tf_path)
        
        # Duas reuniões simultâneas criadas às 10:20
        meeting_rh = repo.create_live_meeting({
            "titulo": "Reunião de Benefícios RH",
            "departamento": "RH",
            "horario": "10:20",
            "data": "2026-10-10"
        })
        meeting_ti = repo.create_live_meeting({
            "titulo": "Reunião de Deploy TI",
            "departamento": "TI",
            "horario": "10:20",
            "data": "2026-10-10"
        })

        id_rh = meeting_rh["ID_MEETING"]
        id_ti = meeting_ti["ID_MEETING"]
        assert id_rh != id_ti

        # Gravação concorrente de chunks de áudio isolados
        repo.record_live_audio_chunk(
            meeting_id=id_rh,
            session_id="sess_rh_1020",
            sequence=0,
            text="A equipe de recursos humanos vai revisar os benefícios.",
            duration=4.0,
            audio_level=25,
            signal_quality="suficiente"
        )
        repo.record_live_audio_chunk(
            meeting_id=id_ti,
            session_id="sess_ti_1020",
            sequence=0,
            text="O time de tecnologia vai fazer o deploy amanhã no Kubernetes.",
            duration=4.0,
            audio_level=30,
            signal_quality="suficiente"
        )

        m_rh = repo.get_by_id(id_rh)
        m_ti = repo.get_by_id(id_ti)

        # 1. Transcrições são 100% isoladas
        assert "benefícios" in m_rh["transcription"]
        assert "deploy" not in m_rh["transcription"]

        assert "deploy" in m_ti["transcription"]
        assert "benefícios" not in m_ti["transcription"]

        # 2. Diagnósticos de chunks são isolados por reunião
        diag_rh = repo.get_pipeline_diagnostics(id_rh)
        diag_ti = repo.get_pipeline_diagnostics(id_ti)

        assert len(diag_rh["chunks"]) == 1
        assert diag_rh["chunks"][0]["session_id"] == "sess_rh_1020"
        assert len(diag_ti["chunks"]) == 1
        assert diag_ti["chunks"][0]["session_id"] == "sess_ti_1020"
    finally:
        if os.path.exists(tf_path):
            os.remove(tf_path)
