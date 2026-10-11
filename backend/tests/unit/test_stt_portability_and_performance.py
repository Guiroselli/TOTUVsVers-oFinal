"""
Testes unitários rigorosos para Portabilidade, Precisão, Baixa Latência e Filas STT do Proton Flow:
- Detecção dinâmica de hardware e resolução de perfis portáteis (cpu_balanced, nvidia_compatible, hardware_limited);
- Não tratamento de AMD RX 580 como CUDA;
- Fallback automático e seguro de CUDA para CPU int8 em caso de falha de carregamento;
- Gerenciamento de fila por reunião e alertas de processamento atrasado (is_delayed);
- Isolamento estrito de duas reuniões simultâneas criadas no mesmo horário (RH vs TI às 10:20);
- Preservação da transcrição bruta (TRANSCRIPT_RAW) e deduplicação na borda;
- Preservação de repetições legítimas ("não, não pode", "muito, muito bom");
- Reprocessamento pós-reunião de alta precisão com badge e auditoria.
"""

import os
import sys
import threading
from typing import Dict, Any, List
from unittest.mock import MagicMock, patch

import pytest

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from hardware_detector import detect_hardware, select_hardware_profile
from stt_service import STTService, get_stt_service
from consolidation import ChunkConsolidator, detect_border_overlap, filter_conversational_noise
from controlled_glossary import ControlledGlossary


class DummySegment:
    def __init__(self, text, start=0.0, end=4.0, avg_logprob=-0.2, no_speech_prob=0.05, compression_ratio=1.2):
        self.text = text
        self.start = start
        self.end = end
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob
        self.compression_ratio = compression_ratio


class DummyModel:
    def __init__(self, simulated_text="Reunião de alinhamento Proton Flow TOTVS"):
        self.simulated_text = simulated_text

    def transcribe(self, audio_path, **kwargs):
        seg = DummySegment(self.simulated_text)
        info = MagicMock()
        info.language = "pt"
        info.language_probability = 0.99
        info.duration = 6.0
        return [seg], info


class TestSTTHardwarePortability:
    """Verifica portabilidade e detecção dinâmica de hardware sem premissas fixas."""

    def test_hardware_detection_real_system(self):
        hw = detect_hardware()
        assert "os" in hw
        assert "cpu" in hw
        assert "ram" in hw
        assert hw["ram"]["total_gb"] > 0
        assert hw["cpu"]["threads"] > 0
        assert "cuda_effective" in hw
        assert "has_amd_gpu" in hw
        assert isinstance(hw["os_gpus"], list)

    def test_amd_rx580_not_treated_as_cuda(self):
        # Simula ambiente com GPU AMD RX 580
        hw_amd = {
            "os": {"system": "Windows"},
            "cpu": {"threads": 16, "cores": 8},
            "ram": {"total_gb": 32.0, "available_gb": 18.0},
            "cuda_effective": False,
            "has_amd_gpu": True,
            "os_gpus": [{"name": "Radeon RX 580 Series", "driver_version": "31.0", "vram_gb": 4.0}],
            "cuda_runtime_error": "Nenhum dispositivo CUDA registrado"
        }
        profile = select_hardware_profile(hw_amd)
        assert profile["device"] == "cpu"
        assert profile["compute_type"] == "int8"
        assert profile["hardware_profile"] == "cpu_balanced"
        assert profile["workers"] == 1
        assert "RX 580" in profile["device_reason"]

    def test_nvidia_gpu_selected_when_cuda_effective(self):
        # Simula ambiente com GPU NVIDIA GeForce / RTX e CUDA validado
        hw_nvidia = {
            "os": {"system": "Windows"},
            "cpu": {"threads": 12, "cores": 6},
            "ram": {"total_gb": 16.0, "available_gb": 10.0},
            "cuda_effective": True,
            "has_amd_gpu": False,
            "cuda_device_count": 1,
            "cuda_supported_compute_types": ["float16", "int8_float16"],
            "os_gpus": [{"name": "NVIDIA GeForce RTX 3060", "driver_version": "535.0", "vram_gb": 12.0}],
            "cuda_runtime_error": None
        }
        profile = select_hardware_profile(hw_nvidia)
        assert profile["device"] == "cuda"
        assert profile["compute_type"] in ("float16", "int8_float16")
        assert profile["hardware_profile"] == "nvidia_compatible"
        assert profile["workers"] >= 2

    def test_hardware_limited_profile_for_low_specs(self):
        # Simula máquina modesta (4GB RAM, 2 threads)
        hw_limited = {
            "os": {"system": "Linux"},
            "cpu": {"threads": 2, "cores": 2},
            "ram": {"total_gb": 4.0, "available_gb": 1.5},
            "cuda_effective": False,
            "has_amd_gpu": False,
            "os_gpus": [],
            "cuda_runtime_error": "No CUDA device"
        }
        profile = select_hardware_profile(hw_limited)
        assert profile["device"] == "cpu"
        assert profile["compute_type"] == "int8"
        assert profile["hardware_profile"] == "hardware_limited"
        assert profile["workers"] == 1

    def test_environment_overrides_respect_user_choice(self):
        # Quando o usuário define explicitamente device=cpu mesmo em máquina com CUDA
        hw_nvidia = {
            "cuda_effective": True,
            "has_amd_gpu": False,
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16}
        }
        profile = select_hardware_profile(
            hw_nvidia,
            requested_device="cpu",
            requested_compute_type="int8",
            requested_model="small",
            requested_workers="1"
        )
        assert profile["device"] == "cpu"
        assert profile["compute_type"] == "int8"
        assert profile["model"] == "small"
        assert profile["workers"] == 1


class TestSTTServiceResilienceAndQueues:
    """Verifica filas por reunião, RTF, fallback de CUDA e concorrência."""

    def test_service_initialization_with_auto_profile(self):
        service = STTService(device="auto", compute_type="auto", model_size="auto")
        assert service.device in ("cpu", "cuda")
        assert service.compute_type in ("int8", "float16", "int8_float16", "float32")
        assert service.hardware_profile in ("cpu_balanced", "nvidia_compatible", "hardware_limited")
        assert service.max_pending_chunks == 2
        assert service.language == "pt"

        status = service.get_status()
        assert status["engine"] == "faster-whisper"
        assert "hardware_profile" in status
        assert "workers" in status
        assert "max_pending_chunks" in status
        assert status["max_pending_chunks"] == 2

    def test_cuda_runtime_fallback_to_cpu_when_model_fails(self):
        service = STTService(device="cuda", compute_type="float16", model_size="small")
        service.set_mock_model(None)
        service._model = None

        with patch("faster_whisper.WhisperModel") as mock_whisper:
            # Primeira chamada (CUDA) falha com erro de runtime
            # Segunda chamada (fallback CPU) tem sucesso
            mock_whisper.side_effect = [
                RuntimeError("CUDA driver version is insufficient for CUDA runtime"),
                MagicMock()
            ]
            loaded_model = service._get_or_load_model()
            assert loaded_model is not None
            assert service.device == "cpu"
            assert service.compute_type == "int8"
            assert service.hardware_profile == "cpu_balanced_fallback"

    def test_per_meeting_queue_and_delayed_processing_alert(self):
        service = STTService()
        dummy_model = DummyModel("Reunião de teste")
        service.set_mock_model(dummy_model)

        meeting_id = "test_meeting_queue_123"

        # Simula que 2 chunks já estão pendentes para esta reunião
        service._meeting_pending_counts[meeting_id] = 2

        # Transcrição deve detectar que a fila atingiu max_pending_chunks e marcar is_delayed=True
        dummy_audio = b"RIFF" + b"\x00" * 2000
        result = service.transcribe_audio_bytes(
            audio_bytes=dummy_audio,
            meeting_id=meeting_id,
            session_id="session_queue_01",
            sequence=3
        )
        assert result["is_delayed"] is True
        assert "rtf" in result
        assert result["rtf"] >= 0.0

        service.clear_session("session_queue_01", meeting_id=meeting_id)
        assert service.get_meeting_pending_count(meeting_id) == 0

    def test_simultaneous_meetings_isolation(self):
        """
        Garante que duas reuniões criadas no mesmo horário (10:20) mantêm
        filas, contextos e transcrições 100% isolados.
        """
        service = STTService()
        model_rh = DummyModel("Alinhamento do departamento pessoal e SESMT")
        service.set_mock_model(model_rh)

        meeting_rh = "meeting_rh_1020"
        meeting_ti = "meeting_ti_1020"
        session_rh = "sess_rh_01"
        session_ti = "sess_ti_01"

        dummy_audio = b"RIFF" + b"\x00" * 3000

        # Chunk da reunião do RH
        res_rh = service.transcribe_audio_bytes(
            audio_bytes=dummy_audio,
            meeting_id=meeting_rh,
            session_id=session_rh,
            sequence=0,
            meeting_context="Reunião do RH Atestados"
        )
        assert "SESMT" in res_rh["text_corrected"] or "departamento pessoal" in res_rh["text_corrected"]

        # Altera simulação para reunião de TI
        service.set_mock_model(DummyModel("Deploy da sprint no Protheus e Fluig"))
        res_ti = service.transcribe_audio_bytes(
            audio_bytes=dummy_audio,
            meeting_id=meeting_ti,
            session_id=session_ti,
            sequence=0,
            meeting_context="Reunião de TI Deploy"
        )
        assert "Protheus" in res_ti["text_corrected"] or "Fluig" in res_ti["text_corrected"]

        # Histórico de contexto de RH não pode conter termos de TI
        rh_ctx = service._session_contexts.get(session_rh, "")
        ti_ctx = service._session_contexts.get(session_ti, "")
        assert "Protheus" not in rh_ctx
        assert "SESMT" not in ti_ctx


class TestSTTLinguisticAccuracyAndConsolidation:
    """Verifica correção de bordas, repetições naturais e glossário controlado."""

    def test_border_overlap_deduplication(self):
        prev_text = "vamos iniciar o alinhamento da reunião estratégica com a equipe"
        next_chunk = "com a equipe para definir o cronograma da entrega"
        deduped = detect_border_overlap(prev_text, next_chunk)
        assert deduped == "para definir o cronograma da entrega"

    def test_legitimate_conversational_repetitions_preserved(self):
        # Repetições intencionais de ênfase em português brasileiro não podem ser apagadas
        raw_speech = "Não, não pode homologar sem validação da diretoria."
        clean, audits = filter_conversational_noise(raw_speech)
        assert "não, não pode" in clean.lower()

        raw_emphasis = "Isso é muito, muito importante para o fechamento fiscal."
        clean_emp, _ = filter_conversational_noise(raw_emphasis)
        assert "muito, muito importante" in clean_emp.lower()

    def test_reprocess_transcript_offline_enhancement(self):
        service = STTService()
        raw_text = "Iniciando a ó neo neo do próton flow com a totts sobre deploi no proteus"
        segments = [{"text": raw_text, "confidence_category": "baixa_confianca"}]

        reprocess_res = service.reprocess_transcript(
            raw_text=raw_text,
            segments=segments,
            meeting_context="TI Proton Flow TOTVS"
        )
        assert reprocess_res["is_reprocessed"] is True
        assert "reunião" in reprocess_res["reprocessed_text"].lower()
        assert "Proton Flow" in reprocess_res["reprocessed_text"]
        assert "TOTVS" in reprocess_res["reprocessed_text"]
        assert reprocess_res["raw_text"] == raw_text
        assert reprocess_res["reprocess_badge"] == "Transcrição refinada em pós-processamento"
