"""
Importador Seguro e Reproduzível do Dataset de Preferências Sintéticas (500 Situações / 2.050 Avaliações).
Salva em:
- artifacts/preferences/raw/ia_preferences_500.csv
- artifacts/preferences/raw/ia_preferences_500.sha256
- artifacts/preferences/metadata.json
"""

import os
import sys
import csv
import io
import json
import hashlib
import argparse
import requests
from datetime import datetime
from typing import Dict, Any, List

DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1W9TnxTFoj4cBIlL3roTsFIfbayTa2iZkuLslBhsiQYU/export?format=csv"
RAW_DIR = os.path.join("artifacts", "preferences", "raw")
METADATA_DIR = os.path.join("artifacts", "preferences")

def import_preferences(source_path_or_url: str = DEFAULT_SHEET_URL) -> Dict[str, Any]:
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(METADATA_DIR, exist_ok=True)

    print(f"[Importador] Obtendo dados de: {source_path_or_url}")
    is_url = source_path_or_url.startswith("http://") or source_path_or_url.startswith("https://")

    if is_url:
        resp = requests.get(source_path_or_url, timeout=30)
        resp.raise_for_status()
        raw_bytes = resp.content
        source_origin = source_path_or_url
    else:
        if not os.path.exists(source_path_or_url):
            raise FileNotFoundError(f"Arquivo local não encontrado: {source_path_or_url}")
        with open(source_path_or_url, "rb") as f:
            raw_bytes = f.read()
        source_origin = os.path.abspath(source_path_or_url)

    # 1. Calcula hash SHA-256
    sha256_hash = hashlib.sha256(raw_bytes).hexdigest()

    # 2. Salva arquivo bruto e hash
    raw_csv_path = os.path.join(RAW_DIR, "ia_preferences_500.csv")
    with open(raw_csv_path, "wb") as f:
        f.write(raw_bytes)

    sha256_path = os.path.join(RAW_DIR, "ia_preferences_500.sha256")
    with open(sha256_path, "w", encoding="utf-8") as f:
        f.write(f"{sha256_hash}  ia_preferences_500.csv\n")

    # 3. Faz parse e auditoria das linhas
    text_content = raw_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text_content))
    header = next(reader, [])

    rows = []
    situations = set()
    evaluators = {}
    areas = {}
    situation_eval_counts = {}
    duplicates = []
    incomplete_rows = []
    seen_eval_sit = set()

    for row_idx, r in enumerate(reader, start=2):
        if len(r) < 9 or not r[6].strip() or not r[8].strip():
            incomplete_rows.append({"row_number": row_idx, "content": r})
            continue

        bloco = r[0].strip()
        intervalo = r[1].strip()
        resp_id = r[2].strip()
        data_hora = r[3].strip()
        avaliador = r[4].strip()
        area = r[5].strip()
        situacao = r[6].strip()
        categoria_titulo = r[7].strip()
        resposta_escolhida = r[8].strip()
        comentario = r[9].strip() if len(r) > 9 else ""
        link_form = r[10].strip() if len(r) > 10 else ""

        # Detecção de duplicata do mesmo avaliador na mesma situação
        eval_sit_key = (avaliador, situacao)
        if eval_sit_key in seen_eval_sit:
            duplicates.append({"row_number": row_idx, "avaliador": avaliador, "situacao": situacao})
        seen_eval_sit.add(eval_sit_key)

        situations.add(situacao)
        evaluators[avaliador] = evaluators.get(avaliador, 0) + 1
        areas[area] = areas.get(area, 0) + 1
        situation_eval_counts[situacao] = situation_eval_counts.get(situacao, 0) + 1

        rows.append({
            "row_index": row_idx,
            "bloco": bloco,
            "intervalo": intervalo,
            "resp_id": resp_id,
            "data_hora": data_hora,
            "avaliador": avaliador,
            "area": area,
            "situacao": situacao,
            "categoria_titulo": categoria_titulo,
            "resposta_escolhida": resposta_escolhida,
            "comentario": comentario,
            "link_form": link_form
        })

    extra_eval_situations = [sit for sit, count in situation_eval_counts.items() if count > 4]

    metadata = {
        "source_origin": source_origin,
        "collection_timestamp": datetime.now().isoformat(),
        "raw_csv_path": raw_csv_path,
        "raw_csv_sha256": sha256_hash,
        "total_rows_imported": len(rows),
        "total_situations": len(situations),
        "total_evaluators": len(evaluators),
        "evaluators_breakdown": evaluators,
        "total_areas": len(areas),
        "areas_breakdown": areas,
        "extra_evaluation_block": "Bloco 1 (Situações 1 a 50)",
        "situations_with_extra_evaluations": len(extra_eval_situations),
        "extra_situations_list": sorted(extra_eval_situations, key=lambda x: int(x) if x.isdigit() else x),
        "duplicated_rows_count": len(duplicates),
        "duplicated_rows": duplicates,
        "incomplete_rows_count": len(incomplete_rows),
        "incomplete_rows": incomplete_rows
    }

    metadata_path = os.path.join(METADATA_DIR, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print("\n--- RESUMO DA INGESTÃO ---")
    print(f"Total de linhas importadas: {len(rows)}")
    print(f"Situações únicas identificadas: {len(situations)}")
    print(f"Avaliadores de IA identificados: {len(evaluators)}")
    print(f"Áreas representadas: {len(areas)}")
    print(f"Situações com resposta extra (5 avaliações): {len(extra_eval_situations)}")
    print(f"Linhas incompletas: {len(incomplete_rows)}")
    print(f"Linhas duplicadas: {len(duplicates)}")
    print(f"SHA-256: {sha256_hash}")
    print(f"Metadados salvos em: {metadata_path}")
    print(f"Raw CSV salvo em: {raw_csv_path}")

    return metadata

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingestão de planilha de preferências de IA")
    parser.add_argument("--source", default=DEFAULT_SHEET_URL, help="URL exportável ou caminho do arquivo local")
    args = parser.parse_args()
    import_preferences(args.source)
