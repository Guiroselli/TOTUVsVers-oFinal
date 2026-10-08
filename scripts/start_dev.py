#!/usr/bin/env python3
"""
Script unificado de inicialização de desenvolvimento do Proton Flow (PARTE 10).
1. Valida o ambiente STT sem reinstalar dependências.
2. Informa status do cache do modelo Whisper.
3. Verifica se as portas (8000 e 5173) já estão em uso para evitar duplicatas.
4. Apresenta URLs da aplicação e comandos de inicialização.
"""

import sys
import os
import socket
import subprocess

_script_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_script_dir)
_backend_dir = os.path.join(_root_dir, "backend")
_frontend_dir = os.path.join(_root_dir, "frontend")

if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    import env_loader  # noqa: F401
except ImportError:
    pass


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def main():
    print("=" * 65)
    print("  PROTON FLOW — INICIALIZAÇÃO DE DESENVOLVIMENTO")
    print("=" * 65)

    # 1. Validação rápida do ambiente STT
    from stt_service import get_stt_service
    stt = get_stt_service()
    status = stt.get_status()

    print("\n[*] Checagem do serviço STT:")
    if not status.get("enabled"):
        print("    [!] STT_ENABLED=false (modo STT desativado)")
    elif not status.get("available"):
        print(f"    [AVISO] STT não está pronto. Motivo: {status.get('reason')}")
        print("    Recomendação: execute 'python scripts/setup_stt.py' antes de iniciar.")
    else:
        print(f"    [OK] STT pronto (modelo '{status.get('model')}', cached={status.get('model_cached')})")

    # 2. Verificação de portas
    backend_busy = is_port_in_use(8000)
    frontend_busy = is_port_in_use(5173)

    print("\n[*] Portas de rede:")
    print(f"    Porta 8000 (Backend)  : {'[EM USO]' if backend_busy else '[LIVRE]'}")
    print(f"    Porta 5173 (Frontend) : {'[EM USO]' if frontend_busy else '[LIVRE]'}")

    print("\n[*] URLs do Sistema:")
    print("    Frontend : http://localhost:5173")
    print("    Backend  : http://127.0.0.1:8000")
    print("    Docs API : http://127.0.0.1:8000/docs")
    print("    STT Meta : http://127.0.0.1:8000/api/stt/status")

    if "--run" in sys.argv:
        if backend_busy:
            print("\n[!] A porta 8000 já está em uso. Encerre o processo anterior antes de reiniciar.")
            sys.exit(1)
        print("\n[*] Iniciando backend Uvicorn na porta 8000...")
        cmd = [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
        subprocess.run(cmd, cwd=_backend_dir)
    else:
        print("\n" + "=" * 65)
        print("Comandos para iniciar em terminais separados:")
        print("  Terminal 1 (Backend):")
        print(f"    cd {_backend_dir}")
        print(f"    {sys.executable} -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload")
        print("\n  Terminal 2 (Frontend):")
        print(f"    cd {_frontend_dir}")
        print("    npm run dev")
        print("=" * 65)


if __name__ == "__main__":
    main()
