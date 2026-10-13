"""
Reconstrução das Alternativas A/B, Prompts e Trechos das 500 Situações
a partir dos 10 Formulários Oficiais do Google Forms.
Gera:
- artifacts/preferences/situations_canonical_500.json
- artifacts/preferences/reconstruction_integrity.json
- artifacts/preferences/reconstruction_integrity.csv
"""

import os
import sys
import re
import json
import csv
import urllib.request
from typing import Dict, Any, List

FORMS_INFO = [
    {"block": 1, "start_id": 1, "end_id": 50, "id": "1FAIpQLSezq9LH6gsF1TZK1FWzaBL9Eros_X725vc8NeY1lCNvpjysRA"},
    {"block": 2, "start_id": 51, "end_id": 100, "id": "1FAIpQLScpgpiIbtlRuXP-eSm3vrjzEeqOQeomRSKlV2VyiELj43IYdA"},
    {"block": 3, "start_id": 101, "end_id": 150, "id": "1FAIpQLSeVD5HgypSWNOgOFleMbvVHfZM4E_8xOcfDwmwzfa8a34bR_Q"},
    {"block": 4, "start_id": 151, "end_id": 200, "id": "1FAIpQLSdMRpNIbhkeMlegwN4JyK1Gv9-SF_V_PfOSRYh-vTg8Hd2Yaw"},
    {"block": 5, "start_id": 201, "end_id": 250, "id": "1FAIpQLSelvo4GK_XfcNokIIMTJVNKEPRwBSvK8KHQR71q3FjelVS0DA"},
    {"block": 6, "start_id": 251, "end_id": 300, "id": "1FAIpQLSdS_NfrRUbEry3gHcynVgBJsRm2B0a77-QHQT5r3LSHW3NEow"},
    {"block": 7, "start_id": 301, "end_id": 350, "id": "1FAIpQLSfPl_kwHe7WreF8aauWR4vAGZGrhaXmSL3URabfH-Ogbo_6PQ"},
    {"block": 8, "start_id": 351, "end_id": 400, "id": "1FAIpQLSeMlKiyrFgs1Erv4ShGAoy3FX2162-nhrPDut_-iYFj0W-Bww"},
    {"block": 9, "start_id": 401, "end_id": 450, "id": "1FAIpQLScQ0J3xlf5p9F-CbO5W2C-zZy_lGOon5oqSn79jg8Si3u00rg"},
    {"block": 10, "start_id": 451, "end_id": 500, "id": "1FAIpQLSf9AmOotEVIHFFLoa4NeCKxbzZ5MPhHELE0lr8uAKy02uELNQ"}
]

OUT_DIR = os.path.join("artifacts", "preferences")

def extract_transcript_from_desc(desc: str) -> str:
    """Extrai o trecho textual literal entre aspas ou a partir de 'Trecho da reunião:'."""
    if not desc:
        return ""
    # Procura aspas tipográficas ou normais
    m = re.search(r'[“"«](.*?)[”"»]', desc, re.DOTALL)
    if m:
        return m.group(1).strip()
    
    # Se não tiver aspas, pega o texto entre "Trecho da reunião:" e "Critério:"
    m2 = re.search(r'Trecho da reuni[ãa]o:\s*(.*?)(?:\n\s*Crit[eé]rio:|$)', desc, re.DOTALL | re.IGNORECASE)
    if m2:
        return m2.group(1).strip()
        
    return desc.strip()

def build_canonical_situations() -> Dict[str, Any]:
    os.makedirs(OUT_DIR, exist_ok=True)
    canon_file = os.path.join(OUT_DIR, "situations_canonical_500.json")
    if os.path.exists(canon_file):
        with open(canon_file, "r", encoding="utf-8") as f:
            canonical = json.load(f)
        if len(canonical) == 500:
            print(f"[Fase 3] Base canônica de 500 situações carregada do cache: {canon_file}")
            return canonical

    canonical = {}
    print("[Fase 3] Baixando e extraindo as 500 situações dos 10 Google Forms...")

    for f_info in FORMS_INFO:
        block = f_info["block"]
        url = f"https://docs.google.com/forms/d/e/{f_info['id']}/viewform"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8")

        m = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);</script>', html, re.DOTALL)
        if not m:
            raise RuntimeError(f"FB_PUBLIC_LOAD_DATA_ não encontrado no bloco {block}")

        data = json.loads(m.group(1))
        items = data[1][1]

        # Filtra os itens de situações
        sit_items = [
            it for it in items 
            if it and len(it) > 4 and it[4] and it[4][0] and len(it[4][0]) > 1 
            and it[4][0][1] and len(it[4][0][1]) >= 4 
            and any("Leitura A" in str(c[0]) for c in it[4][0][1])
        ]

        print(f"  Bloco {block} (ID {f_info['start_id']} a {f_info['end_id']}): {len(sit_items)} questões extraídas")

        expected_count = f_info["end_id"] - f_info["start_id"] + 1
        if len(sit_items) != expected_count:
            print(f"  AVISO: Bloco {block} esperava {expected_count} mas obteve {len(sit_items)}")

        for idx, it in enumerate(sit_items):
            cur_id = f_info["start_id"] + idx
            title = it[1]
            desc = it[2] or ""
            choices = [c[0] for c in it[4][0][1]]
            
            # Identifica Leitura A e Leitura B
            opt_a = next((c for c in choices if c.startswith("Leitura A:") or "Leitura A" in c), "")
            opt_b = next((c for c in choices if c.startswith("Leitura B:") or "Leitura B" in c), "")
            
            # Limpa prefixos "Leitura A: " e "Leitura B: " para guardar o texto puro e o texto com rótulo
            clean_a = re.sub(r"^Leitura A:\s*", "", opt_a).strip()
            clean_b = re.sub(r"^Leitura B:\s*", "", opt_b).strip()

            transcript = extract_transcript_from_desc(desc)

            # Categoria da pergunta
            cat_match = re.search(r'\[(.*?)\]', title)
            category = cat_match.group(1) if cat_match else "Geral"

            canonical[str(cur_id)] = {
                "situation_id": cur_id,
                "block": block,
                "title": title,
                "category": category,
                "prompt_description": desc,
                "transcript": transcript,
                "option_A_raw": opt_a,
                "option_B_raw": opt_b,
                "option_A_text": clean_a,
                "option_B_text": clean_b,
                "all_choices": choices,
                "source": f"google_form_block_{block}"
            }

    print(f"\nTotal de situações canônicas compiladas: {len(canonical)} de 500.")

    # Salva JSON Canônico
    canon_file = os.path.join(OUT_DIR, "situations_canonical_500.json")
    with open(canon_file, "w", encoding="utf-8") as f:
        json.dump(canonical, f, indent=2, ensure_ascii=False)
    print(f"Salvo: {canon_file}")

    return canonical


def audit_and_reconstruct_pairs(canonical: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Cruza as 2.050 avaliações da planilha com as 500 situações canônicas."""
    raw_csv = os.path.join("artifacts", "preferences", "raw", "ia_preferences_500.csv")
    if not os.path.exists(raw_csv):
        raise FileNotFoundError(f"Raw CSV não encontrado em {raw_csv}")

    with open(raw_csv, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    print(f"\n[Fase 3] Cruzando {len(rows)} avaliações da planilha com a base canônica...")

    reconstructed_pairs = []
    integrity_rows = []

    for r in rows:
        bloco = r[0].strip()
        resp_id = r[2].strip()
        avaliador = r[4].strip()
        area = r[5].strip()
        sit_id_str = r[6].strip()
        cat_titulo = r[7].strip()
        escolha = r[8].strip()
        comentario = r[9].strip() if len(r) > 9 else ""

        b_num = int(bloco) if bloco.isdigit() else 1
        s_raw = int(sit_id_str) if sit_id_str.isdigit() else 1
        q_idx = (s_raw - 1) % 100 + 1
        canon_id = str((b_num - 1) * 50 + q_idx)

        sit_data = canonical.get(canon_id)
        if not sit_data:
            # Situação não encontrada
            integrity_rows.append({
                "situation_id": canon_id,
                "raw_situation_id": sit_id_str,
                "evaluator": avaliador,
                "prompt_present": False,
                "chosen_present": False,
                "rejected_present": False,
                "transcript_present": False,
                "option_source": "none",
                "reconstruction_status": "error_situation_not_found"
            })
            continue

        prompt = sit_data["prompt_description"]
        transcript = sit_data["transcript"]
        opt_a = sit_data["option_A_text"]
        opt_b = sit_data["option_B_text"]

        # Classificação da escolha
        escolha_lower = escolha.lower()
        if "leitura a" in escolha_lower and "leitura b" not in escolha_lower:
            chosen = opt_a
            rejected = opt_b
            status = "reconstructed_success"
            choice_type = "A"
        elif "leitura b" in escolha_lower and "leitura a" not in escolha_lower:
            chosen = opt_b
            rejected = opt_a
            status = "reconstructed_success"
            choice_type = "B"
        elif "as duas" in escolha_lower:
            chosen = None
            rejected = None
            status = "non_pair_both_acceptable"
            choice_type = "both"
        elif "nenhuma" in escolha_lower:
            chosen = None
            rejected = None
            status = "non_pair_neither_acceptable"
            choice_type = "none"
        else:
            chosen = None
            rejected = None
            status = "error_unrecognized_choice"
            choice_type = "unrecognized"

        prompt_present = bool(prompt and len(prompt) > 10)
        transcript_present = bool(transcript and len(transcript) > 5)
        chosen_present = bool(chosen)
        rejected_present = bool(rejected)

        integrity_rows.append({
            "situation_id": int(canon_id),
            "raw_situation_id": sit_id_str,
            "evaluator": avaliador,
            "choice_type": choice_type,
            "prompt_present": prompt_present,
            "chosen_present": chosen_present,
            "rejected_present": rejected_present,
            "transcript_present": transcript_present,
            "option_source": sit_data["source"],
            "reconstruction_status": status
        })

        if status == "reconstructed_success" and chosen_present and rejected_present and prompt_present:
            reconstructed_pairs.append({
                "situation_id": int(canon_id),
                "raw_situation_id": sit_id_str,
                "block": int(bloco) if bloco.isdigit() else bloco,
                "title": sit_data["title"],
                "category": sit_data["category"],
                "area": area,
                "evaluator": avaliador,
                "choice": choice_type,
                "prompt": f"Você é o assistente executivo Proton Flow. Analise a reunião e gere a síntese fiel.\n\n{prompt}",
                "transcript": transcript,
                "chosen": chosen,
                "rejected": rejected,
                "comment": comentario,
                "source": "synthetic_ai_preference",
                "evidence_required": True
            })

    # Salva integridade
    integ_json = os.path.join(OUT_DIR, "reconstruction_integrity.json")
    with open(integ_json, "w", encoding="utf-8") as f:
        json.dump(integrity_rows, f, indent=2, ensure_ascii=False)

    integ_csv = os.path.join(OUT_DIR, "reconstruction_integrity.csv")
    with open(integ_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "situation_id", "raw_situation_id", "evaluator", "choice_type", "prompt_present",
            "chosen_present", "rejected_present", "transcript_present",
            "option_source", "reconstruction_status"
        ])
        writer.writeheader()
        writer.writerows(integrity_rows)

    print(f"Tabela de integridade salva em: {integ_csv} e {integ_json}")
    print(f"Total de pares perfeitamente reconstruídos: {len(reconstructed_pairs)} de {len(rows)}")

    # Salva pares reconstruídos
    pairs_file = os.path.join(OUT_DIR, "reconstructed_pairs_raw.json")
    with open(pairs_file, "w", encoding="utf-8") as f:
        json.dump(reconstructed_pairs, f, indent=2, ensure_ascii=False)
    print(f"Salvo pares brutos em: {pairs_file}")

    return reconstructed_pairs

if __name__ == "__main__":
    canonical = build_canonical_situations()
    audit_and_reconstruct_pairs(canonical)
