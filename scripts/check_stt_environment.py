#!/usr/bin/env python3
"""
Diagnóstico detalhado do ambiente de execução STT do Proton Flow (PARTE 1).
Verifica Python, faster-whisper, av, FFmpeg, variáveis de ambiente e cache do modelo.
Retorna código de saída 0 para READY e 1 para NOT_READY.
"""

import sys
import os
import shutil

# Adiciona o diretório backend ao sys.path para reutilizar os serviços
_script_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_script_dir)
_backend_dir = os.path.join(_root_dir, "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    import env_loader  # noqa: F401
except ImportError:
    pass


def run_diagnostics() -> bool:
    print("=" * 65)
    print("  PROTON FLOW — DIAGNÓSTICO DO AMBIENTE STT (Speech-to-Text)")
    print("=" * 65)

    all_ready = True
    issues = []

    # 1. Interpretador Python e Versão
    py_exec = sys.executable
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    print(f"\n[1] Interpretador Python:")
    print(f"    Executável : {py_exec}")
    print(f"    Versão     : {py_ver}")

    if sys.version_info < (3, 10):
        issues.append("Python incompatível: requer versão >= 3.10.")
        all_ready = False
        print("    Status     : [FALHA] Versão mínima suportada é Python 3.10.")
    else:
        print("    Status     : [OK] Compatível (>= 3.10)")

    # 2. Biblioteca faster-whisper
    print(f"\n[2] Dependência faster-whisper:")
    try:
        import faster_whisper
        fw_ver = getattr(faster_whisper, "__version__", "instalada")
        print(f"    Versão     : {fw_ver}")
        print("    Status     : [OK] Presente e importável")
    except Exception as e:
        issues.append(f"faster-whisper ausente ou com erro de importação: {e}")
        all_ready = False
        print(f"    Status     : [FALHA] {e}")

    # 3. Biblioteca av (PyAV)
    print(f"\n[3] Dependência av (PyAV):")
    try:
        import av
        av_ver = getattr(av, "__version__", "instalada")
        print(f"    Versão     : {av_ver}")
        # Validação de compatibilidade com faster-whisper (av < 19)
        major_ver = int(av_ver.split(".")[0]) if av_ver[0].isdigit() else 0
        if major_ver >= 19:
            issues.append(f"av versão {av_ver} incompatível com faster-whisper. Requer av < 19.")
            all_ready = False
            print("    Status     : [ALERTA] av >= 19 pode falhar com metadata_errors. Recomendado: av < 19.")
        else:
            print("    Status     : [OK] Presente e compatível com faster-whisper")
    except Exception as e:
        issues.append(f"av ausente ou com erro de importação: {e}")
        all_ready = False
        print(f"    Status     : [FALHA] {e}")

    # 4. FFmpeg (Binário de Sistema e PyAV libav)
    print(f"\n[4] Subsistema FFmpeg:")
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        print(f"    Binário OS : Encontrado ({ffmpeg_bin})")
    else:
        print("    Binário OS : Ausente no PATH (não obrigatório, PyAV embutido supre decodificação)")

    try:
        import av
        libav_codecs = av.codec.codecs_available
        print(f"    PyAV Libav : Operacional ({len(libav_codecs)} codecs disponíveis internamente)")
    except Exception:
        print("    PyAV Libav : Indisponível")

    # 5. Configurações de Ambiente STT
    from stt_service import get_stt_service, STT_MODEL_SIZE, STT_DEVICE, STT_COMPUTE_TYPE, STT_ENABLED
    stt = get_stt_service()
    status = stt.get_status()

    print(f"\n[5] Configurações STT (.env / os.environ):")
    print(f"    STT_ENABLED        : {status.get('enabled')}")
    print(f"    STT_PROVIDER       : {status.get('provider')}")
    print(f"    STT_MODEL_SIZE     : {status.get('model')}")
    print(f"    STT_DEVICE         : {status.get('device')}")
    print(f"    STT_COMPUTE_TYPE   : {status.get('compute_type')}")
    print(f"    STT_LANGUAGE       : {status.get('language')}")
    print(f"    Cache Dir          : {status.get('cache_dir')}")

    if not status.get("enabled"):
        issues.append("STT está desabilitado (STT_ENABLED=false).")
        all_ready = False

    # 6. Status do Cache do Modelo
    print(f"\n[6] Verificação do Cache do Modelo:")
    is_cached = status.get("model_cached", False)
    if is_cached:
        print(f"    Modelo '{status.get('model')}' : Encontrado no cache local.")
        print("    Status          : [OK] Pronto para inferência sem download")
    else:
        issues.append(f"Modelo '{status.get('model')}' não está presente no cache local.")
        all_ready = False
        print(f"    Modelo '{status.get('model')}' : NÃO encontrado no cache.")
        print("    Status          : [FALHA] Execute 'python scripts/setup_stt.py' para baixar uma única vez.")

    # 7. Conclusão Final
    print("\n" + "=" * 65)
    if all_ready:
        print("  RESULTADO FINAL: [READY]")
        print("  O ambiente STT está completamente configurado e pronto.")
        print("=" * 65)
        return True
    else:
        print("  RESULTADO FINAL: [NOT_READY]")
        print("  Pendências detectadas:")
        for idx, item in enumerate(issues, 1):
            print(f"    {idx}. {item}")
        print("\n  Para corrigir automaticamente, execute:")
        print("    python scripts/setup_stt.py")
        print("=" * 65)
        return False


if __name__ == "__main__":
    ready = run_diagnostics()
    sys.exit(0 if ready else 1)
