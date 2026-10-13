import os
import sys
import time
import json
import asyncio
import io
import wave
import numpy as np

# Adiciona o diretório backend ao path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from stt_service import STTService, preprocess_and_analyze_audio, get_stt_service
from controlled_glossary import ControlledGlossary
from consolidation import filter_conversational_noise


def calculate_wer(reference: str, hypothesis: str) -> float:
    """Calcula Word Error Rate (WER) via Levenshtein em nível de palavras."""
    ref_words = reference.lower().split()
    hyp_words = hypothesis.lower().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    d = np.zeros((len(ref_words) + 1, len(hyp_words) + 1), dtype=int)
    for i in range(len(ref_words) + 1):
        d[i][0] = i
    for j in range(len(hyp_words) + 1):
        d[0][j] = j

    for i in range(1, len(ref_words) + 1):
        for j in range(1, len(hyp_words) + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                substitution = d[i - 1][j - 1] + 1
                insertion = d[i][j - 1] + 1
                deletion = d[i - 1][j] + 1
                d[i][j] = min(substitution, insertion, deletion)

    return float(d[len(ref_words)][len(hyp_words)] / len(ref_words))


def calculate_cer(reference: str, hypothesis: str) -> float:
    """Calcula Character Error Rate (CER) via Levenshtein em nível de caracteres."""
    ref_chars = list(reference.lower().replace(" ", ""))
    hyp_chars = list(hypothesis.lower().replace(" ", ""))
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0

    d = np.zeros((len(ref_chars) + 1, len(hyp_chars) + 1), dtype=int)
    for i in range(len(ref_chars) + 1):
        d[i][0] = i
    for j in range(len(hyp_chars) + 1):
        d[0][j] = j

    for i in range(1, len(ref_chars) + 1):
        for j in range(1, len(hyp_chars) + 1):
            if ref_chars[i - 1] == hyp_chars[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                substitution = d[i - 1][j - 1] + 1
                insertion = d[i][j - 1] + 1
                deletion = d[i - 1][j] + 1
                d[i][j] = min(substitution, insertion, deletion)

    return float(d[len(ref_chars)][len(hyp_chars)] / len(ref_chars))


async def generate_speech_file(text: str, voice: str, rate: str, pitch: str, output_path: str):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(output_path)


def run_benchmark():
    benchmark_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "benchmark_audio"))
    os.makedirs(benchmark_dir, exist_ok=True)

    mandatory_phrase = (
        "Esta é uma reunião do Proton Flow. "
        "O time de recursos humanos precisa revisar os benefícios dos colaboradores. "
        "A equipe de tecnologia também vai verificar o ambiente de homologação. "
        "Ainda não definimos o responsável nem o prazo final. "
        "A decisão será tomada depois da validação."
    )

    test_cases = [
        {
            "id": "tc1_mandatory_normal",
            "name": "Frase Obrigatória - Fala Normal (Antonio)",
            "text": mandatory_phrase,
            "voice": "pt-BR-AntonioNeural",
            "rate": "+0%",
            "pitch": "+0Hz",
            "critical_words": ["proton flow", "recursos humanos", "benefícios", "tecnologia", "homologação", "não definimos", "validação"]
        },
        {
            "id": "tc2_mandatory_fast",
            "name": "Frase Obrigatória - Fala Rápida +25% (Francisca)",
            "text": mandatory_phrase,
            "voice": "pt-BR-FranciscaNeural",
            "rate": "+25%",
            "pitch": "+0Hz",
            "critical_words": ["proton flow", "recursos humanos", "benefícios", "tecnologia", "homologação", "não definimos", "validação"]
        },
        {
            "id": "tc3_mandatory_accented_cadence",
            "name": "Frase Obrigatória - Cadência com Pausas (Antonio)",
            "text": (
                "Esta é uma reunião do Proton Flow. "
                "O time de RH, de recursos humanos, precisa revisar os benefícios dos colaboradores. "
                "A equipe de tecnologia também vai verificar o ambiente de homologação. "
                "Ainda não definimos o responsável nem o prazo final. "
                "A decisão será tomada depois da validação técnica."
            ),
            "voice": "pt-BR-AntonioNeural",
            "rate": "-10%",
            "pitch": "-5Hz",
            "critical_words": ["proton flow", "rh", "recursos humanos", "tecnologia", "homologação", "não definimos", "validação"]
        },
        {
            "id": "tc4_corporate_totvs_dialogue",
            "name": "Termos Corporativos TOTVS / TI / RH (Francisca)",
            "text": (
                "Alinhamento semanal do time de tecnologia. "
                "O sistema Protheus precisa ser integrado ao Proton Flow antes do fim do sprint. "
                "Solicitamos apoio da equipe de RH para validar os acessos dos colaboradores. "
                "Não temos impedimento crítico até o momento."
            ),
            "voice": "pt-BR-FranciscaNeural",
            "rate": "+10%",
            "pitch": "+0Hz",
            "critical_words": ["tecnologia", "protheus", "proton flow", "sprint", "rh", "colaboradores", "não temos"]
        }
    ]

    print("=== Proton Flow STT PT-BR Benchmark Suite ===")
    print(f"Diretório de áudios: {benchmark_dir}")

    # Gera os arquivos de áudio via edge-tts se não existirem
    for tc in test_cases:
        fpath = os.path.join(benchmark_dir, f"{tc['id']}.mp3")
        tc["audio_path"] = fpath
        if not os.path.exists(fpath):
            print(f"Gerando áudio {tc['id']} via edge-tts ({tc['voice']}, {tc['rate']})...")
            asyncio.run(generate_speech_file(tc["text"], tc["voice"], tc["rate"], tc["pitch"], fpath))
        else:
            print(f"Áudio {tc['id']} já existente: {fpath}")

    # Inicializa serviço STT
    stt = get_stt_service()
    stt_status = stt.get_status()
    print(f"\nSTT inicial: provider={stt_status['provider']}, model={stt_status['model']}, device={stt_status['device']}")

    configurations = [
        {"model": "small", "beam_size": 3, "label": "faster-whisper-small (beam=3, online)"},
        {"model": "small", "beam_size": 5, "label": "faster-whisper-small (beam=5, offline/reprocess)"},
        {"model": "base", "beam_size": 3, "label": "faster-whisper-base (beam=3, leve)"},
    ]

    results = []

    for cfg in configurations:
        print(f"\n--- Testando Configuração: {cfg['label']} ---")
        stt.set_model_size(cfg["model"])
        stt.beam_size = cfg["beam_size"]

        for tc in test_cases:
            with open(tc["audio_path"], "rb") as f:
                audio_bytes = f.read()

            t0 = time.perf_counter()
            # Passa pela pipeline completa de pré-processamento e transcrição
            res = stt.transcribe_audio_bytes(
                audio_bytes=audio_bytes,
                filename_hint=os.path.basename(tc["audio_path"]),
                language="pt",
                session_id=f"bench_{tc['id']}",
                meeting_context="Reunião Proton Flow TOTVS TI RH Benefícios",
                meeting_id=f"bench_{tc['id']}"
            )
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

            raw_hyp = res.get("text", "")
            norm_hyp = res.get("text_corrected", raw_hyp)
            duration = res.get("duration", 0.0)
            rtf = round(elapsed_ms / (duration * 1000.0), 3) if duration > 0 else 0.0

            ref = tc["text"]
            wer_raw = round(calculate_wer(ref, raw_hyp), 4)
            wer_norm = round(calculate_wer(ref, norm_hyp), 4)
            cer_norm = round(calculate_cer(ref, norm_hyp), 4)

            # Verificação de palavras críticas
            norm_lower = norm_hyp.lower()
            missed_crit = [cw for cw in tc["critical_words"] if cw not in norm_lower]

            # Verificação de preservação de negação ("não definimos", "não temos")
            negation_preserved = True
            if "não definimos" in tc["text"].lower() and "não definimos" not in norm_lower and "não" not in norm_lower:
                negation_preserved = False

            item = {
                "config": cfg["label"],
                "model": cfg["model"],
                "beam_size": cfg["beam_size"],
                "test_case_id": tc["id"],
                "test_case_name": tc["name"],
                "duration_s": duration,
                "latency_ms": elapsed_ms,
                "rtf": rtf,
                "wer_raw": wer_raw,
                "wer_normalized": wer_norm,
                "cer_normalized": cer_norm,
                "reference": ref,
                "raw_hypothesis": raw_hyp,
                "normalized_hypothesis": norm_hyp,
                "missed_critical_words": missed_crit,
                "negation_preserved": negation_preserved,
                "audio_level": res.get("audio_level", 0),
                "signal_quality": res.get("signal_quality", "suficiente"),
                "glossary_audits": res.get("glossary_corrections", [])
            }
            results.append(item)

            print(f"[{tc['id']}] WER Norm: {wer_norm * 100:.1f}% | CER: {cer_norm * 100:.1f}% | Latência: {elapsed_ms}ms (RTF: {rtf})")
            print(f"  Ref  : {ref}")
            print(f"  Norm : {norm_hyp}")
            if missed_crit:
                print(f"  [AVISO] Palavras críticas faltantes: {missed_crit}")
            else:
                print(f"  [OK] Todas as palavras críticas detectadas com sucesso!")

    # Restaura configuração padrão recomendada: small, beam 3
    stt.set_model_size("small")
    stt.beam_size = 3

    out_json = os.path.join(benchmark_dir, "stt_benchmark_results.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nResultados completos exportados para: {out_json}")
    return results


if __name__ == "__main__":
    run_benchmark()
