"""
Testes unitários offline para download e cache de modelos faster-whisper (especialmente 'medium').
Garante verificação de integridade, reutilização de cache persistente, prevenção de downloads
redundantes, tratamento de espaço em disco e ausência de chamadas reais de rede na suíte.
"""

import os
import tempfile
import shutil
import unittest
from unittest.mock import patch, MagicMock

from stt_service import STTService
from hardware_detector import select_hardware_profile


class TestSTTModelCacheAndDownload(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_stt_cache_")

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def _create_mock_model_files(self, directory: str, size_bytes: int = 15 * 1024 * 1024):
        """Cria arquivos simulados de modelo para testar cache offline sem rede."""
        os.makedirs(directory, exist_ok=True)
        bin_path = os.path.join(directory, "model.bin")
        cfg_path = os.path.join(directory, "config.json")
        with open(bin_path, "wb") as f:
            f.seek(size_bytes - 1)
            f.write(b"\0")
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write('{"model_type": "whisper"}')
        return bin_path, cfg_path

    def test_model_cached_returns_true_when_files_complete(self):
        """Valida que modelo com model.bin e config.json de tamanho válido é reconhecido como em cache."""
        self._create_mock_model_files(self.test_dir, size_bytes=20 * 1024 * 1024)
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True
        self.assertTrue(svc.is_model_cached("medium"))

    def test_model_cached_rejects_incomplete_stub_download(self):
        """Valida que download incompleto (ex: 0 bytes ou stub pequeno) NÃO é considerado válido."""
        # Cria arquivo model.bin com apenas 100 bytes (incompleto)
        self._create_mock_model_files(self.test_dir, size_bytes=100)
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True
        self.assertFalse(svc.is_model_cached("medium"))

    def test_download_model_if_needed_skips_when_already_cached(self):
        """Valida que download_model_if_needed não faz download quando o modelo já está completo no cache."""
        self._create_mock_model_files(self.test_dir, size_bytes=20 * 1024 * 1024)
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True

        def fake_dl(model_name, output_dir=None, local_files_only=False):
            if local_files_only:
                return output_dir or self.test_dir
            raise AssertionError("Não deveria tentar download com rede quando já está em cache!")

        with patch("faster_whisper.utils.download_model", side_effect=fake_dl):
            res = svc.download_model_if_needed("medium")
            self.assertTrue(res)

    def test_download_model_if_needed_simulated_success(self):
        """Valida que download_model_if_needed efetua download inicial simulado e valida integridade."""
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True

        def fake_download(model_name, output_dir=None, local_files_only=False):
            if local_files_only:
                if not os.path.exists(os.path.join(output_dir or self.test_dir, "model.bin")):
                    raise FileNotFoundError("Não em cache")
                return output_dir or self.test_dir
            # Simula download criando arquivos
            self._create_mock_model_files(output_dir or self.test_dir, size_bytes=20 * 1024 * 1024)
            return output_dir or self.test_dir

        with patch("faster_whisper.utils.download_model", side_effect=fake_download):
            self.assertFalse(svc.is_model_cached("medium"))
            ok = svc.download_model_if_needed("medium")
            self.assertTrue(ok)
            self.assertTrue(svc.is_model_cached("medium"))

    def test_download_model_if_needed_insufficient_disk_space(self):
        """Valida que falta de espaço em disco (~1.5 GB necessários para medium) rejeita download e registra erro claro."""
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True

        # Simula apenas 100 MB livres
        fake_usage = MagicMock()
        fake_usage.free = 100 * 1024 * 1024
        with patch("shutil.disk_usage", return_value=fake_usage):
            ok = svc.download_model_if_needed("medium")
            self.assertFalse(ok)
            self.assertIn("insufficient_disk_space", svc._load_error)

    def test_download_model_if_needed_connectivity_failure(self):
        """Valida que falha de rede/conexão durante download inicial é capturada sem mascarar erro."""
        svc = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc._dependency_checked = True
        svc._dependency_available = True

        with patch("faster_whisper.utils.download_model", side_effect=ConnectionError("Host unreachable")):
            ok = svc.download_model_if_needed("medium")
            self.assertFalse(ok)
            self.assertIn("model_download_failed", svc._load_error)

    def test_reuse_model_after_service_restart(self):
        """Valida reuso automático do modelo do cache persistente após reinício do serviço."""
        # Sessão 1: modelo já está em cache
        self._create_mock_model_files(self.test_dir, size_bytes=25 * 1024 * 1024)

        # Sessão 2: Nova instância do STTService apontando para o mesmo cache_dir
        svc2 = STTService(model_size="medium", model_cache_dir=self.test_dir)
        svc2._dependency_checked = True
        svc2._dependency_available = True

        def fake_dl(model_name, output_dir=None, local_files_only=False):
            if local_files_only:
                return output_dir or self.test_dir
            raise AssertionError("Não deveria tentar download de rede no reuso!")

        with patch("faster_whisper.utils.download_model", side_effect=fake_dl):
            self.assertTrue(svc2.is_model_cached("medium"))
            self.assertTrue(svc2.is_available())

    def test_hardware_detector_selects_medium_for_cuda_compatible(self):
        """Valida que o detector de hardware recomenda 'medium' quando CUDA é validado (RTX 3060)."""
        fake_cuda_hw = {
            "cuda_effective": True,
            "cuda_supported_compute_types": ["float16", "int8_float16"],
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16},
            "has_amd_gpu": False
        }
        profile = select_hardware_profile(hw_info=fake_cuda_hw, requested_model="auto")
        self.assertEqual(profile["hardware_profile"], "nvidia_compatible")
        self.assertEqual(profile["model"], "medium")
        self.assertEqual(profile["device"], "cuda")
        self.assertEqual(profile["compute_type"], "float16")
        self.assertEqual(profile["workers"], 2)

    def test_hardware_detector_preserves_custom_model_override_on_cuda(self):
        """Valida que override explícito de modelo (ex: small) em CUDA é respeitado."""
        fake_cuda_hw = {
            "cuda_effective": True,
            "cuda_supported_compute_types": ["float16", "int8_float16"],
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16},
            "has_amd_gpu": False
        }
        profile = select_hardware_profile(hw_info=fake_cuda_hw, requested_model="small")
        self.assertEqual(profile["model"], "small")

    def test_hardware_detector_selects_small_for_cpu(self):
        """Valida que para CPU moderna sem CUDA, o perfil seleciona 'small' int8."""
        fake_cpu_hw = {
            "cuda_effective": False,
            "cuda_runtime_error": "No CUDA",
            "ram": {"total_gb": 32.0},
            "cpu": {"threads": 16},
            "has_amd_gpu": True
        }
        profile = select_hardware_profile(hw_info=fake_cpu_hw, requested_model="auto")
        self.assertEqual(profile["hardware_profile"], "cpu_balanced")
        self.assertEqual(profile["model"], "small")
        self.assertEqual(profile["device"], "cpu")


if __name__ == "__main__":
    unittest.main()
