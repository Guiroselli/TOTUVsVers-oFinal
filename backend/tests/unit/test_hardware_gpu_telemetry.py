"""
Testes unitários para detecção de GPU, telemetria NVIDIA (superando teto WMI 4GB),
rastreamento de fallback GPU->CPU e integridade do endpoint /api/stt/status.
"""

import unittest
from unittest.mock import patch, MagicMock
import subprocess

from hardware_detector import (
    find_nvidia_smi,
    query_nvidia_smi,
    detect_os_gpus,
    detect_hardware,
    select_hardware_profile,
    verify_effective_cuda_support
)
from stt_service import STTService


class TestHardwareGpuTelemetry(unittest.TestCase):

    def test_find_nvidia_smi_path_lookup(self):
        """Valida que find_nvidia_smi busca no PATH e caminhos padrão do sistema."""
        with patch("shutil.which", return_value="C:\\Windows\\System32\\nvidia-smi.exe"):
            with patch("os.path.isfile", return_value=True):
                found = find_nvidia_smi()
                self.assertEqual(found, "C:\\Windows\\System32\\nvidia-smi.exe")

    def test_query_nvidia_smi_parses_accurate_vram_and_telemetry(self):
        """Valida que query_nvidia_smi supera o limite de 4GB do WMI para RTX 3060 12GB/8GB."""
        mock_output = "NVIDIA GeForce RTX 3060, 12288, 10450, 1838, 560.94, 48, 15\n"
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = mock_output

        with patch("hardware_detector.find_nvidia_smi", return_value="nvidia-smi"):
            with patch("subprocess.run", return_value=mock_proc):
                res = query_nvidia_smi()
                self.assertEqual(len(res), 1)
                gpu = res[0]
                self.assertEqual(gpu["name"], "NVIDIA GeForce RTX 3060")
                self.assertEqual(gpu["total_vram_mb"], 12288.0)
                self.assertEqual(gpu["free_vram_mb"], 10450.0)
                self.assertEqual(gpu["used_vram_mb"], 1838.0)
                self.assertEqual(gpu["vram_gb"], 12.0)
                self.assertEqual(gpu["free_vram_gb"], 10.21)
                self.assertEqual(gpu["driver_version"], "560.94")
                self.assertEqual(gpu["temperature_c"], 48.0)
                self.assertEqual(gpu["utilization_gpu_pct"], 15.0)
                self.assertEqual(gpu["source"], "nvidia-smi")

    def test_detect_os_gpus_merges_without_duplication(self):
        """Valida que detect_os_gpus prioriza nvidia-smi para NVIDIA sem duplicar com WMI."""
        mock_nvidia = [{
            "name": "NVIDIA GeForce RTX 3060",
            "vram_gb": 12.0,
            "total_vram_mb": 12288.0,
            "driver_version": "560.94",
            "source": "nvidia-smi"
        }]
        with patch("hardware_detector.query_nvidia_smi", return_value=mock_nvidia):
            with patch("platform.system", return_value="Windows"):
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(
                        returncode=0,
                        stdout='[{"Name": "NVIDIA GeForce RTX 3060", "AdapterRAM": 4293918720, "DriverVersion": "32.0.15.6094"}, {"Name": "Intel UHD Graphics 770", "AdapterRAM": 1073741824, "DriverVersion": "31.0.101"}]'
                    )
                    gpus = detect_os_gpus()
                    self.assertEqual(len(gpus), 2)
                    self.assertEqual(gpus[0]["name"], "NVIDIA GeForce RTX 3060")
                    self.assertEqual(gpus[0]["vram_gb"], 12.0)
                    self.assertEqual(gpus[0]["source"], "nvidia-smi")
                    self.assertEqual(gpus[1]["name"], "Intel UHD Graphics 770")
                    self.assertEqual(gpus[1]["source"], "wmi")

    def test_select_hardware_profile_nvidia_compatible(self):
        """Valida seleção de perfil nvidia_compatible quando CUDA runtime está ativo."""
        fake_hw = {
            "cuda_effective": True,
            "cuda_supported_compute_types": ["float16", "int8_float16"],
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16},
            "has_amd_gpu": False
        }
        profile = select_hardware_profile(hw_info=fake_hw, requested_device="auto")
        self.assertEqual(profile["hardware_profile"], "nvidia_compatible")
        self.assertEqual(profile["device"], "cuda")
        self.assertEqual(profile["compute_type"], "float16")
        self.assertEqual(profile["workers"], 2)

    def test_select_hardware_profile_amd_rx580_cpu_fallback(self):
        """Valida que RX 580 ou AMD sem CUDA aciona perfil CPU_BALANCED sem mascarar erro."""
        fake_hw = {
            "cuda_effective": False,
            "cuda_runtime_error": "Nenhum dispositivo CUDA registrado no runtime do CTranslate2",
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16},
            "has_amd_gpu": True
        }
        profile = select_hardware_profile(hw_info=fake_hw, requested_device="auto")
        self.assertEqual(profile["hardware_profile"], "cpu_balanced")
        self.assertEqual(profile["device"], "cpu")
        self.assertEqual(profile["compute_type"], "int8")
        self.assertIn("RX 580", profile["device_reason"])

    def test_stt_service_fallback_tracking_requested_cuda_but_unavailable(self):
        """Valida que quando device='cuda' falha na inicializacao, fallback_occurred e True e CPU e adotada."""
        svc = STTService(device="cuda", compute_type="float16")
        svc.set_mock_model(None)
        svc._model = None
        svc.is_available = MagicMock(return_value=True)

        with patch("faster_whisper.WhisperModel", side_effect=[RuntimeError("CUDA driver not installed"), MagicMock()]):
            model = svc._get_or_load_model()
            self.assertIsNotNone(model)
            self.assertTrue(svc.fallback_occurred)
            self.assertEqual(svc.device, "cpu")
            self.assertEqual(svc.compute_type, "int8")
            self.assertIn("CUDA driver not installed", svc.fallback_reason)
            st = svc.get_status()
            self.assertTrue(st["fallback_occurred"])
            self.assertEqual(st["device"], "cpu")
            self.assertIn("CUDA driver not installed", st["fallback_reason"])

    def test_stt_service_model_load_cuda_exception_triggers_fallback(self):
        """Valida que se o WhisperModel falhar em CUDA na inicialização, fallback para CPU int8 é registrado."""
        svc = STTService(device="cpu")
        svc.device = "cuda"
        svc.compute_type = "float16"
        svc.is_available = MagicMock(return_value=True)

        with patch("faster_whisper.WhisperModel", side_effect=[RuntimeError("CUDA out of memory"), MagicMock()]):
            model = svc._get_or_load_model()
            self.assertIsNotNone(model)
            self.assertTrue(svc.fallback_occurred)
            self.assertIn("CUDA out of memory", svc.fallback_reason)
            self.assertEqual(svc.device, "cpu")
            self.assertEqual(svc.compute_type, "int8")
            self.assertEqual(svc.hardware_profile, "cpu_balanced_fallback")


if __name__ == "__main__":
    unittest.main()
