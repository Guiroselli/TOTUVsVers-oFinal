"""
Serviço de gerenciamento e conexão automática com o Ollama local (PARTE 11).
Garante que o Ollama esteja em execução e conectado ao iniciar a aplicação.
"""

import os
import sys
import json
import time
import shutil
import logging
import threading
import subprocess
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# URL padrão de comunicação com o Ollama (utiliza 127.0.0.1 para evitar latência de DNS IPv6 no Windows)
DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"


def get_ollama_base_url() -> str:
    """Extrai a URL base do Ollama a partir da variável OLLAMA_URL."""
    url = os.getenv("OLLAMA_URL", f"{DEFAULT_OLLAMA_BASE_URL}/api/generate").strip()
    if "/api/" in url:
        url = url.split("/api/")[0]
    url = url.rstrip("/")
    if "://localhost:" in url:
        url = url.replace("://localhost:", "://127.0.0.1:")
    return url


def find_ollama_executable() -> Optional[str]:
    """
    Localiza o executável do Ollama no sistema (Windows / Linux / macOS).
    Prioriza o aplicativo de desktop no Windows para exibir ícone na bandeja.
    """
    # 1. Caminho de usuário no Windows (App padrão de instalação)
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")

    candidate_paths = []
    if local_app_data:
        candidate_paths.append(os.path.join(local_app_data, "Programs", "Ollama", "ollama app.exe"))
        candidate_paths.append(os.path.join(local_app_data, "Programs", "Ollama", "ollama.exe"))

    if user_profile:
        candidate_paths.append(os.path.join(user_profile, "AppData", "Local", "Programs", "Ollama", "ollama app.exe"))
        candidate_paths.append(os.path.join(user_profile, "AppData", "Local", "Programs", "Ollama", "ollama.exe"))

    program_files = os.environ.get("ProgramFiles", "")
    if program_files:
        candidate_paths.append(os.path.join(program_files, "Ollama", "ollama app.exe"))
        candidate_paths.append(os.path.join(program_files, "Ollama", "ollama.exe"))

    for p in candidate_paths:
        if os.path.isfile(p):
            return p

    # 2. Busca no PATH do sistema operacional
    which_path = shutil.which("ollama")
    if which_path:
        return which_path

    return None


_cached_gpu_available: Optional[bool] = None

def is_gpu_available() -> bool:
    """Detecta se uma GPU dedicada está disponível para inferência (com cache em memória)."""
    global _cached_gpu_available
    if _cached_gpu_available is not None:
        return _cached_gpu_available

    try:
        base_url = get_ollama_base_url()
        req = urllib.request.Request(f"{base_url}/api/ps", headers={"User-Agent": "ProtonFlow"})
        with urllib.request.urlopen(req, timeout=1.0) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                models = data.get("models") or []
                if models and any((m.get("size_vram") or 0) > 0 for m in models):
                    _cached_gpu_available = True
                    return True
    except Exception:
        pass

    # Verifica presença do utilitário nvidia-smi
    _cached_gpu_available = bool(shutil.which("nvidia-smi") or shutil.which("rocm-smi"))
    return _cached_gpu_available


class OllamaService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(OllamaService, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._last_status: Optional[Dict[str, Any]] = None
        self._last_check_time: float = 0
        self._check_cache_ttl: float = 3.0  # cache status for 3 seconds
        self._is_starting: bool = False

    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Consulta o status em tempo real do Ollama."""
        now = time.time()
        if not force_refresh and self._last_status and (now - self._last_check_time) < self._check_cache_ttl:
            return self._last_status

        base_url = get_ollama_base_url()
        target_model = os.getenv("OLLAMA_MODEL", "llama3").strip()
        gpu = is_gpu_available()

        status_result = {
            "connected": False,
            "running": False,
            "url": base_url,
            "models": [],
            "target_model": target_model,
            "target_model_installed": False,
            "gpu_available": gpu,
            "message": "Ollama desconectado",
            "executable_found": bool(find_ollama_executable())
        }

        try:
            req = urllib.request.Request(f"{base_url}/api/tags", headers={"User-Agent": "ProtonFlow"})
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode("utf-8"))
                    models = [m.get("name") for m in body.get("models", []) if m.get("name")]
                    status_result["connected"] = True
                    status_result["running"] = True
                    status_result["models"] = models
                    # Verifica se o modelo alvo está instalado (ex: 'llama3' casa com 'llama3:latest')
                    status_result["target_model_installed"] = any(
                        target_model == m or m.startswith(f"{target_model}:") for m in models
                    )
                    status_result["message"] = (
                        f"Ollama ativo com {len(models)} modelo(s)" if models else "Ollama ativo (sem modelos)"
                    )
        except (urllib.error.URLError, TimeoutError, ConnectionRefusedError, OSError) as err:
            status_result["connected"] = False
            status_result["running"] = False
            status_result["message"] = f"Não foi possível conectar ao Ollama em {base_url}: {err}"

        self._last_status = status_result
        self._last_check_time = now
        return status_result

    def start_ollama(self) -> bool:
        """Inicia o processo do Ollama em segundo plano sem bloquear a aplicação."""
        if self._is_starting:
            return True

        status = self.get_status(force_refresh=True)
        if status.get("connected"):
            return True

        exe = find_ollama_executable()
        if not exe:
            logger.error("Executável do Ollama não encontrado no sistema.")
            return False

        self._is_starting = True
        try:
            logger.info("Iniciando Ollama a partir de: %s", exe)
            creation_flags = 0
            if sys.platform == "win32":
                # Processo desanexado para não bloquear o terminal ou matar o Ollama ao fechar a sessão
                DETACHED_PROCESS = 0x00000008
                CREATE_NEW_PROCESS_GROUP = 0x00000200
                creation_flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP

            if exe.lower().endswith("ollama app.exe"):
                subprocess.Popen(
                    [exe],
                    creationflags=creation_flags,
                    close_fds=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            else:
                subprocess.Popen(
                    [exe, "serve"],
                    creationflags=creation_flags,
                    close_fds=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            return True
        except Exception as e:
            logger.error("Erro ao iniciar Ollama: %s", e)
            return False
        finally:
            self._is_starting = False

    def ensure_running(self, auto_start: bool = True, wait_seconds: int = 8) -> Dict[str, Any]:
        """
        Garante que o Ollama esteja ativo e conectado.
        Se não estiver e auto_start for True, inicia o processo e aguarda até wait_seconds.
        """
        status = self.get_status(force_refresh=True)
        if status.get("connected"):
            return status

        if not auto_start:
            return status

        started = self.start_ollama()
        if not started:
            return status

        # Aguarda o Ollama inicializar a porta HTTP
        start_time = time.time()
        while time.time() - start_time < wait_seconds:
            time.sleep(1.0)
            status = self.get_status(force_refresh=True)
            if status.get("connected"):
                logger.info("Ollama conectado com sucesso após inicialização automática.")
                return status

        return status

    def start_background_connector(self):
        """Inicia verificação assíncrona em thread separada para não travar o startup da API."""
        def _runner():
            logger.info("Verificando prontidão do Ollama em segundo plano...")
            res = self.ensure_running(auto_start=True, wait_seconds=10)
            if res.get("connected"):
                logger.info("Ollama operacional: %s (Modelos: %s)", res.get("url"), res.get("models"))
            else:
                logger.warning("Ollama não pôde ser inicializado automaticamente: %s", res.get("message"))

        thread = threading.Thread(target=_runner, daemon=True, name="OllamaAutoConnect")
        thread.start()


def get_ollama_service() -> OllamaService:
    return OllamaService()
