#!/usr/bin/env python3
"""
Setup seguro, reprodutível e idempotente do STT para o Proton Flow.
Garante funcionamento idêntico a partir da raiz do repositório ou da pasta backend:
1. Valida versão do Python (>= 3.10).
2. Cria backend/.env a partir de .env.example (se não existir, sem sobrescrever personalizações).
3. Instala dependências de requirements.txt apenas se ausentes ou incompatíveis.
4. Valida faster-whisper, ctranslate2, av (< 19), FastAPI e Uvicorn.
5. Resolve o diretório do cache em relação à raiz do projeto.
6. Verifica se o modelo já está no cache local antes de baixar.
7. Baixa os pesos apenas se estiver ausente.
8. Valida o carregamento real do modelo com WhisperModel na memória.
9. Exibe o caminho absoluto final do cache e comandos de execução.
"""

import sys
import os
import platform
import shutil
import subprocess

_script_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_script_dir)
_backend_dir = os.path.join(_root_dir, "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    from path_utils import resolve_model_cache_dir, get_project_root
except ImportError:
    try:
        from backend.path_utils import resolve_model_cache_dir, get_project_root
    except ImportError:
        def get_project_root() -> str:
            return _root_dir

        def resolve_model_cache_dir(cache_dir=None) -> str:
            raw = cache_dir or os.getenv("STT_MODEL_CACHE_DIR", "./models")
            expanded = os.path.expanduser(str(raw).strip() or "./models")
            if os.path.isabs(expanded):
                return os.path.abspath(os.path.normpath(expanded))
            return os.path.abspath(os.path.normpath(os.path.join(_root_dir, expanded)))


def check_python_compatibility() -> bool:
    print(f"[*] Sistema Operacional: {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"[*] Python: {sys.executable} (versão {sys.version.split()[0]})")
    if sys.version_info < (3, 10):
        print("\n[ERRO CRÍTICO] Versão do Python incompatível.")
        print(f"O Proton Flow requer Python 3.10 ou superior (versão atual: {sys.version.split()[0]}).")
        print("Instale uma versão suportada do Python (recomendado: Python 3.11 ou 3.12) e tente novamente.")
        return False
    return True


def ensure_env_file() -> str:
    env_example = os.path.join(_backend_dir, ".env.example")
    env_target = os.path.join(_backend_dir, ".env")

    if not os.path.isfile(env_target):
        if os.path.isfile(env_example):
            shutil.copyfile(env_example, env_target)
            print(f"[+] Arquivo de configuração '{env_target}' criado a partir de '.env.example'.")
        else:
            print("[!] Aviso: .env.example não encontrado; mantendo defaults do sistema.")
    else:
        print(f"[*] Arquivo de configuração '{env_target}' já existente. Configurações preservadas.")

    return env_target


def are_dependencies_installed() -> bool:
    try:
        import faster_whisper  # noqa: F401
        import ctranslate2  # noqa: F401
        import av  # noqa: F401
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401

        # Validação de versão compatível de PyAV (< 19)
        av_ver = getattr(av, "__version__", "")
        if av_ver and av_ver[0].isdigit() and int(av_ver.split(".")[0]) >= 19:
            print(f"[!] PyAV versão {av_ver} detectada (incompatível com faster-whisper, requer av < 19).")
            return False
        return True
    except (ImportError, ModuleNotFoundError) as err:
        print(f"[*] Dependência ausente detectada: {err}")
        return False


def install_dependencies():
    print("[*] Verificando dependências no ambiente...")
    if are_dependencies_installed():
        print("[OK] Todas as dependências (faster-whisper, ctranslate2, av, fastapi, uvicorn) já estão instaladas.")
        return

    req_file = os.path.join(_backend_dir, "requirements.txt")
    print(f"[*] Instalando dependências de '{req_file}'...")
    cmd = [sys.executable, "-m", "pip", "install", "-r", req_file]
    try:
        subprocess.check_call(cmd)
        print("[OK] Dependências instaladas com sucesso.")
    except subprocess.CalledProcessError as err:
        print(f"\n[ERRO CRÍTICO] Falha ao instalar dependências: {err}")
        sys.exit(1)


def ensure_model_cached(model_size: str, abs_cache_dir: str):
    from faster_whisper.utils import download_model

    print(f"\n[*] Diretório de Cache Absoluto do Modelo: {abs_cache_dir}")
    os.makedirs(abs_cache_dir, exist_ok=True)

    print(f"[*] Verificando presença local do modelo Whisper '{model_size}'...")
    cached = False
    try:
        download_model(model_size, output_dir=abs_cache_dir, local_files_only=True)
        cached = True
    except Exception:
        cached = False

    if cached:
        print(f"[OK] Modelo '{model_size}' já disponível no cache local. Nenhum download necessário.")
        return

    print(f"[*] Modelo '{model_size}' não encontrado em '{abs_cache_dir}'.")
    print(f"[*] Iniciando download único e controlado para o cache persistente...")
    try:
        download_model(model_size, output_dir=abs_cache_dir, local_files_only=False)
        print(f"[OK] Download do modelo '{model_size}' concluído com sucesso!")
    except Exception as dl_err:
        print(f"\n[ERRO CRÍTICO] Falha ao baixar o modelo Whisper '{model_size}': {dl_err}")
        print("Verifique a conexão de rede ou configure um modelo menor (ex: base) no backend/.env.")
        sys.exit(1)


def validate_model_loading(model_size: str, abs_cache_dir: str):
    from faster_whisper import WhisperModel

    print(f"[*] Validando carregamento do modelo '{model_size}' a partir de '{abs_cache_dir}'...")
    try:
        model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            download_root=abs_cache_dir,
            local_files_only=True
        )
        print("[OK] Modelo carregado com sucesso na memória RAM (CPU int8). Motor STT operacional.")
        del model
    except Exception as load_err:
        print(f"\n[ERRO CRÍTICO] Falha ao inicializar WhisperModel a partir do cache: {load_err}")
        sys.exit(1)


def main():
    print("=" * 65)
    print("  PROTON FLOW — SETUP AUTOMATIZADO E PORTÁTIL DE AMBIENTE STT")
    print("=" * 65)

    if not check_python_compatibility():
        sys.exit(1)

    ensure_env_file()
    install_dependencies()

    # Carrega .env para obter tamanho e cache do modelo
    try:
        import env_loader  # noqa: F401
    except ImportError:
        pass

    model_size = os.getenv("STT_MODEL_SIZE", "small")
    raw_cache_dir = os.getenv("STT_MODEL_CACHE_DIR", "./models")
    abs_cache_dir = resolve_model_cache_dir(raw_cache_dir)

    ensure_model_cached(model_size, abs_cache_dir)
    validate_model_loading(model_size, abs_cache_dir)

    print("\n" + "=" * 65)
    print("  SETUP STT CONCLUÍDO COM SUCESSO! [READY]")
    print(f"  Cache Absoluto: {abs_cache_dir}")
    print("=" * 65)
    print("\nComandos para iniciar a aplicação:")
    print("  1. Backend (a partir da raiz do projeto):")
    print("     python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000")
    print("  OU dentro da pasta backend/:")
    print("     cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000")
    print("\n  2. Frontend (em outro terminal):")
    print("     cd frontend && npm run dev")
    print("\n  Ou utilize o inicializador unificado: python scripts/start_dev.py\n")


if __name__ == "__main__":
    main()
