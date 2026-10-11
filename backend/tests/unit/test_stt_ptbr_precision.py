"""
Testes automatizados para Melhoria Real da Precisão do STT pt-BR:
1. Modelo faster-whisper-small configurado com parâmetros corporativos determinísticos.
2. Idioma travado em 'pt' com task='transcribe' (sem alternância aleatória de idioma).
3. Classificação de confiança por segmento (alta, média, baixa, revisão necessária).
4. Glossário controlado auditável com reversibilidade e proteção a repetições legítimas ('não, não pode').
5. Preservação estrita da transcrição bruta (TRANSCRIPT_RAW) vs normalizada (TRANSCRIPT_NORMALIZED).
6. Auditoria de cortes de borda e sobreposições (border_overlaps_audit).
7. Cálculo de métricas objetivas (WER, CER, corporate WER, border cuts, hallucination check).
8. Isolamento estrito entre reuniões simultâneas (RH vs TI) e zero retenção de áudio.
"""

import os
import sys
import tempfile
import pytest
from unittest.mock import MagicMock, patch

_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.abspath(os.path.join(_current_dir, "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from controlled_glossary import ControlledGlossary, get_controlled_glossary
from consolidation import ChunkConsolidator, reconstruct_normalized_from_raw, detect_border_overlap
from audio_evaluation import (
    calculate_wer,
    calculate_cer,
    calculate_corporate_wer,
    detect_border_cuts,
    detect_hallucinated_words,
    evaluate_transcription
)
from stt_service import (
    STTService,
    get_stt_service,
    STT_INITIAL_PROMPT,
    preprocess_and_analyze_audio
)
from repositories import MeetingRepository


# ==============================================================================
# 1. Configuração do Modelo STT e Idioma Fixo pt-BR
# ==============================================================================

def test_stt_fixed_language_and_task_configuration():
    """Valida que o idioma está fixado em 'pt' e a task é 'transcribe' por padrão."""
    with patch.dict(os.environ, {
        "STT_MODEL_SIZE": "small",
        "STT_TASK": "transcribe",
        "STT_BEAM_SIZE": "5",
        "STT_VAD_SPEECH_PAD_MS": "600",
        "STT_VAD_MIN_SPEECH_DURATION_MS": "250",
        "STT_VAD_MIN_SILENCE_DURATION_MS": "350"
    }):
        svc = STTService()
        assert svc.fixed_language == "pt"
        assert svc.task == "transcribe"
        assert svc.beam_size == 5
        assert svc.vad_speech_pad_ms == 600
        assert svc.vad_min_speech_duration_ms == 250
        assert svc.vad_min_silence_duration_ms == 350
        assert svc.model_size == "small"

        status = svc.get_status()
        assert status["language"] == "pt"
        assert status["task"] == "transcribe"
        assert status["model_name"] == "faster-whisper-small"
        assert status["vad_speech_pad_ms"] == 600
        assert "faster_whisper_version" in status
        assert "ctranslate2_version" in status


def test_stt_model_selection_and_singleton():
    """Garante que get_stt_service() opera como singleton sem recriar instâncias por chunk."""
    svc1 = get_stt_service()
    svc2 = get_stt_service()
    assert svc1 is svc2


# ==============================================================================
# 2. Avaliação de Confiança de Segmentos
# ==============================================================================

def test_segment_confidence_classification():
    """Valida classificação em alta, média, baixa confiança e revisão necessária."""
    svc = STTService()
    
    # Alta confiança
    seg_high = {"avg_logprob": -0.2, "no_speech_prob": 0.05, "compression_ratio": 1.2}
    cat_high, score_high = svc.classify_segment_confidence(seg_high)
    assert cat_high == "alta_confianca"
    assert score_high >= 0.85

    # Média confiança
    seg_med = {"avg_logprob": -0.65, "no_speech_prob": 0.20, "compression_ratio": 1.4}
    cat_med, score_med = svc.classify_segment_confidence(seg_med)
    assert cat_med == "media_confianca"

    # Baixa confiança (logprob baixo ou no_speech alto)
    seg_low = {"avg_logprob": -1.2, "no_speech_prob": 0.45, "compression_ratio": 1.8}
    cat_low, score_low = svc.classify_segment_confidence(seg_low)
    assert cat_low in ("baixa_confianca", "revisao_necessaria")

    # Revisão necessária (compressão anômala de repetição/alucinação)
    seg_halluc = {"avg_logprob": -1.5, "no_speech_prob": 0.65, "compression_ratio": 2.8}
    cat_halluc, _ = svc.classify_segment_confidence(seg_halluc)
    assert cat_halluc == "revisao_necessaria"


# ==============================================================================
# 3. Glossário Controlado, Reversibilidade e Preservação de Repetições
# ==============================================================================

def test_controlled_glossary_phonetic_correction_with_evidence():
    """Testa correção fonética comprovada do erro histórico 'ó neo neo' -> 'reunião'."""
    glossary = get_controlled_glossary()
    
    raw = "Iniciando a ó neo neo com a equipe"
    context = {"department": "Geral", "topic": "reunião de alinhamento"}
    segments = [{"text": "Iniciando a ó neo neo", "confidence_category": "baixa_confianca", "confidence_score": 0.45}]
    
    normalized, corrections = glossary.correct_text(raw, segments=segments, meeting_context=context)
    
    assert "reunião" in normalized
    assert "ó neo neo" not in normalized
    assert len(corrections) == 1
    assert corrections[0]["original"] == "ó neo neo"
    assert corrections[0]["canonical"] == "reunião"
    assert corrections[0]["reversible"] is True


def test_controlled_glossary_reversibility():
    """Garante que qualquer texto normalizado por glossário pode ser revertido ao bruto."""
    raw = "vamos abrir um chamado no flug e validar o proteus"
    glossary = get_controlled_glossary()
    normalized, corrections = glossary.correct_text(
        raw,
        segments=[{"text": raw, "confidence_category": "baixa_confianca"}],
        meeting_context={"department": "TI"}
    )
    
    assert "Fluig" in normalized
    assert "Protheus" in normalized
    
    # Reversibilidade estrita
    reconstructed = reconstruct_normalized_from_raw(raw, corrections)
    assert reconstructed == normalized


def test_preservation_of_legitimate_repetitions():
    """Garante que repetições naturais legítimas ('não, não pode', 'muito, muito bom') NÃO são apagadas."""
    consolidator = ChunkConsolidator()
    
    raw_repeated = "Não, não pode aprovar sem laudo do SESMT. É muito, muito importante."
    chunks = [
        {"sequence": 0, "text": raw_repeated, "confidence_category": "alta_confianca"}
    ]
    
    res = consolidator.consolidate(chunks)
    assert "Não, não pode" in res["transcript_normalized"]
    assert "muito, muito importante" in res["transcript_normalized"]
    assert res["transcript_raw"] == raw_repeated


def test_controlled_glossary_leaves_high_confidence_unrelated_alone():
    """Não altera palavras legítimas quando a confiança é alta e não há evidência de erro."""
    glossary = get_controlled_glossary()
    high_conf_text = "O cliente solicitou um parecer técnico sobre o contrato."
    segments = [{"text": high_conf_text, "confidence_category": "alta_confianca", "confidence_score": 0.95}]
    
    normalized, corrections = glossary.correct_text(high_conf_text, segments=segments)
    assert normalized == high_conf_text
    assert len(corrections) == 0


# ==============================================================================
# 4. Auditoria de Cortes de Borda e Consolidação
# ==============================================================================

def test_chunk_border_overlap_audit():
    """Verifica se palavras sobrepostas entre chunks são deduplicadas e registradas na auditoria."""
    consolidator = ChunkConsolidator()
    chunks = [
        {"sequence": 0, "text": "Alinhamos os prazos da sprint com a equipe de"},
        {"sequence": 1, "text": "equipe de desenvolvimento para a entrega na sexta"}
    ]
    
    res = consolidator.consolidate(chunks)
    # Garante que "equipe de" não duplicou
    assert res["transcript_normalized"] == "Alinhamos os prazos da sprint com a equipe de desenvolvimento para a entrega na sexta"
    # Auditoria de borda registrada
    assert len(res["border_overlaps_audit"]) >= 1
    assert "equipe de" in res["border_overlaps_audit"][0]["removed_overlap"]


# ==============================================================================
# 5. Métricas Objetivas (WER, CER, Corporate WER, Alucinações)
# ==============================================================================

def test_audio_evaluation_metrics_wer_cer():
    """Valida o cálculo formal de WER e CER com referências reais."""
    ref = "Esta é a reunião de alinhamento do Proton Flow com a TOTVS"
    hyp_good = "Esta é a reunião de alinhamento do Proton Flow com a TOTVS"
    hyp_bad = "Esta é a ó neo neo de alinhamento do próton flow com a totts"
    
    res_good = evaluate_transcription(ref, hyp_good)
    assert res_good["wer"] == 0.0
    assert res_good["cer"] == 0.0
    assert res_good["corporate_accuracy"] == 1.0
    
    res_bad = evaluate_transcription(ref, hyp_bad)
    assert res_bad["wer"] > 0.25
    assert res_bad["corporate_accuracy"] < 0.60
    assert "reunião" in res_bad["missed_terms"]


def test_detect_border_cuts_and_hallucinations():
    """Valida detecção de palavras cortadas na borda e palavras inventadas/alucinadas."""
    ref = "vamos enviar o atestado para o departamento pessoal"
    hyp_with_cut = "enviar o atestado para o departamento"
    
    cuts = detect_border_cuts(ref, hyp_with_cut)
    assert cuts["initial_cut"] is True
    assert cuts["final_cut"] is True
    assert cuts["missing_initial_word"] == "vamos"
    assert cuts["missing_final_word"] == "pessoal"
    
    hyp_with_halluc = "vamos enviar o atestado para o departamento pessoal urgentemente extraterrestre"
    hallucs = detect_hallucinated_words(ref, hyp_with_halluc)
    assert "extraterrestre" in hallucs


# ==============================================================================
# 6. Isolamento Estrito entre Reuniões Simultâneas (RH vs TI)
# ==============================================================================

def test_simultaneous_meetings_isolation_rh_vs_ti():
    """Garante isolamento absoluto de áudio, transcrições e contextos em reuniões simultâneas."""
    repo = MeetingRepository()
    
    # Cria duas reuniões simultâneas no mesmo timestamp
    m_rh = repo.create_meeting({
        "TITULO_REUNIAO": "Alinhamento de Folha e Atestados",
        "DEPARTAMENTO": "RH",
        "HORARIO_AGENDADO": "10:20",
        "data": "2026-10-10",
        "NOME_CLIENTE": "TOTVS RH Corporativo"
    })
    
    m_ti = repo.create_meeting({
        "TITULO_REUNIAO": "Daily Sprint Deploy",
        "DEPARTAMENTO": "TI",
        "HORARIO_AGENDADO": "10:20",
        "data": "2026-10-10",
        "NOME_CLIENTE": "TOTVS Core Eng"
    })
    
    id_rh = m_rh["ID_MEETING"]
    id_ti = m_ti["ID_MEETING"]
    assert id_rh != id_ti
    
    # Envia chunks para RH
    repo.record_live_audio_chunk(
        id_rh,
        session_id="sess_rh_1020",
        sequence=0,
        text="Precisamos registrar o atestado médico no sistema.",
        duration=8.0,
        signal_quality="suficiente",
        meeting_context={"department": "RH", "title": "Folha de Pagamento"}
    )
    
    # Envia chunks para TI
    repo.record_live_audio_chunk(
        id_ti,
        session_id="sess_ti_1020",
        sequence=0,
        text="O deploy do Protheus será realizado ao final da sprint.",
        duration=8.0,
        signal_quality="suficiente",
        meeting_context={"department": "TI", "title": "Deploy Sprint"}
    )
    
    # Consulta reuniões e verifica isolamento estrito
    rh_after = repo.get_meeting_by_id(id_rh)
    ti_after = repo.get_meeting_by_id(id_ti)
    
    assert "atestado" in rh_after["ANON_TRANSCRICAO"]
    assert "Protheus" not in rh_after["ANON_TRANSCRICAO"]
    assert "deploy" not in rh_after["ANON_TRANSCRICAO"]
    
    assert "deploy" in ti_after["ANON_TRANSCRICAO"]
    assert "Protheus" in ti_after["ANON_TRANSCRICAO"]
    assert "atestado" not in ti_after["ANON_TRANSCRICAO"]


# ==============================================================================
# 7. Zero Retenção Permanente de Áudio em Disco
# ==============================================================================

def test_zero_raw_audio_retention_policy():
    """Valida que o diretório de trabalho do backend não acumula arquivos de áudio temporários."""
    import glob
    scratch_dir = os.path.abspath(_backend_dir)
    audio_files = glob.glob(os.path.join(scratch_dir, "**/*.raw_audio"), recursive=True) + \
                  glob.glob(os.path.join(scratch_dir, "**/*.temp_chunk"), recursive=True)
    assert len(audio_files) == 0
