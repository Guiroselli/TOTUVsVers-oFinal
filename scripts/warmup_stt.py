#!/usr/bin/env python3
"""
Script de warm-up do modelo Whisper para o Proton Flow (PARTE 7).
Pré-carrega o modelo na memória RAM e executa uma inferência de teste rápida
para garantir que o motor STT responda imediatamente no primeiro chunk ao vivo.
"""

import sys
import os
import time
import io
import wave

_script_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_script_dir)
_backend_dir = os.path.join(_root_dir, "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    import env_loader  # noqa: F401
except ImportError:
    pass

from stt_service import get_stt_service


def run_warmup() -> bool:
    print("=" * 65)
    print("  PROTON FLOW — WARM-UP DO MOTOR STT (faster-whisper)")
    print("=" * 65)

    stt = get_stt_service()
    status = stt.get_status()

    if not status.get("available"):
        print(f"\n[ERRO] STT não está disponível para warm-up. Motivo: {status.get('reason')}")
        print("Execute 'python scripts/setup_stt.py' antes de executar o warm-up.")
        return False

    print(f"[*] Modelo configurado: {status.get('model')}")
    print(f"[*] Dispositivo       : {status.get('device')}")
    print(f"[*] Tipo computação   : {status.get('compute_type')}")
    print(f"[*] Cache do modelo   : {status.get('cache_dir')}")

    t0 = time.perf_counter()
    print("\n[*] Carregando modelo na memória RAM...")
    try:
        warmup_res = stt.warmup()
        t_load = round((time.perf_counter() - t0) * 1000, 2)
        print(f"[OK] Modelo carregado na memória em {t_load} ms.")
    except Exception as e:
        print(f"\n[FALHA] Erro ao carregar modelo: {e}")
        return False

    # Validação mínima com 0.2s de áudio PCM
    print("[*] Executando inferência rápida de teste (áudio sintético 0.2s)...")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 3200)
    wav_bytes = buf.getvalue()

    t_inf_start = time.perf_counter()
    try:
        res = stt.transcribe_audio_bytes(wav_bytes, filename_hint="warmup.wav", language="pt")
        t_inf = round((time.perf_counter() - t_inf_start) * 1000, 2)
        print(f"[OK] Inferência concluída em {t_inf} ms (retorno operacional normal).")
    except Exception as inf_err:
        print(f"[FALHA] Erro na inferência de teste: {inf_err}")
        return False

    final_status = stt.get_status()
    print("\n" + "=" * 65)
    print(f"  WARM-UP CONCLUÍDO COM SUCESSO! ready={final_status.get('ready')}")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_warmup()
    sys.exit(0 if success else 1)
