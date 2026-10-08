#!/usr/bin/env python3
"""
Setup seguro, reprodutível e idempotente do STT para o Proton Flow (PARTE 3).
Executável em qualquer máquina nova:
1. Detecta SO e valida versão do Python (>= 3.10).
2. Cria backend/.env a partir de .env.example (se não existir).
3. Instala dependências apenas se estiverem ausentes ou incompatíveis.
4. Verifica faster-whisper e av.
5. Verifica se o modelo já está no cache local.
6. Baixa os pesos do modelo somente se estiver ausente.
7. Valida o carregamento do modelo na memória.
8. Exibe instruções para iniciar o sistema.
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
        print(f"[*] Arquivo de configuração '{env_target}' já existente. Nenhuma alteração feita.")

    return env_target


def are_dependencies_installed() -> bool:
    try:
        import faster_whisper  # noqa: F401
        import av  # noqa: F401
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        # Verifica versão do av (< 19)
        av_ver = getattr(av, "__version__", "")
        if av_ver and av_ver[0].isdigit() and int(av_ver.split(".")[0]) >= 19:
            print(f"[!] av versão {av_ver} detectada (incompatível com faster-whisper, requer < 19).")
            return False
        return True
    except (ImportError, ModuleNotFoundError):
        return False


def install_dependencies():
    print("[*] Verificando dependências no ambiente...")
    if are_dependencies_installed():
        print("[OK] Todas as dependências já estão instaladas e compatíveis. Pulando instalação.")
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


def ensure_model_cached(model_size: str, cache_dir: str):
    from faster_whisper.utils import download_model

    print(f"\n[*] Verificando cache do modelo Whisper '{model_size}'...")
    cached = False
    try:
        if cache_dir and os.path.exists(cache_dir):
            try:
                download_model(model_size, output_dir=cache_dir, local_files_only=True)
                cached = True
            except Exception:
                pass
        if not cached:
            download_model(model_size, local_files_only=True)
            cached = True
    except Exception:
        cached = False

    if cached:
        print(f"[OK] Modelo '{model_size}' já presente no cache local. Nenhum download necessário.")
        return

    print(f"[*] Modelo '{model_size}' ausente. Iniciando download único para cache persistente...")
    out_dir = cache_dir if cache_dir else None
    try:
        download_model(model_size, output_dir=out_dir, local_files_only=False)
        print(f"[OK] Download do modelo '{model_size}' concluído com sucesso!")
    except Exception as dl_err:
        print(f"\n[ERRO CRÍTICO] Falha ao baixar o modelo Whisper '{model_size}': {dl_err}")
        print("Verifique a conexão de rede ou configure um modelo menor (ex: base) no .env.")
        sys.exit(1)


def validate_model_loading(model_size: str, cache_dir: str):
    from faster_whisper import WhisperModel
    print(f"[*] Validando carregamento do modelo '{model_size}' na memória...")
    dl_root = cache_dir if cache_dir else None
    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8", download_root=dl_root)
        print("[OK] Modelo carregado com sucesso! Motor STT operacional.")
        del model
    except Exception as load_err:
        print(f"\n[ERRO CRÍTICO] Falha ao inicializar WhisperModel: {load_err}")
        sys.exit(1)


def main():
    print("=" * 65)
    print("  PROTON FLOW — SETUP AUTOMATIZADO DE AMBIENTE STT")
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

    model_size = os.getenv("STT_MODEL_SIZE", "base")
    cache_dir = os.getenv("STT_MODEL_CACHE_DIR", "")

    ensure_model_cached(model_size, cache_dir)
    validate_model_loading(model_size, cache_dir)

    print("\n" + "=" * 65)
    print("  SETUP STT CONCLUÍDO COM SUCESSO! [READY]")
    print("=" * 65)
    print("\nPara iniciar a aplicação:")
    print("  1. Backend : python -m uvicorn main:app --host 127.0.0.1 --port 8000 (dentro de backend/)")
    print("  2. Frontend: npm run dev (dentro de frontend/)")
    print("  Ou utilize o script unificado: python scripts/start_dev.py\n")


if __name__ == "__main__":
    main()
