import os
import json
import re
import shutil
from datetime import datetime

MIN_TRANSCRIPT_CHARS = 120
MIN_TRANSCRIPT_WORDS = 20
MIN_FACTUAL_ANALYSIS_CHARS = 250

PLACEHOLDER_REGEX = re.compile(r'\[(PESSOA|EMPRESA|CLIENTE|DATA|CARGO|VALOR|PRAZO|SISTEMA|NOME)\]', re.IGNORECASE)

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'[^\w\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()

def check_evidence_in_transcript(evidence: str, transcript: str) -> bool:
    if not evidence or not transcript:
        return False
    clean_ev = normalize_text(evidence)
    clean_tr = normalize_text(transcript)
    if not clean_ev or len(clean_ev) < 5:
        return False
    if "não localizada" in clean_ev or "nao localizada" in clean_ev:
        return False
    if clean_ev in clean_tr:
        return True
    # Check if a substantial 4-word window from evidence appears in transcript
    words = clean_ev.split()
    if len(words) >= 4:
        for i in range(len(words) - 3):
            window = " ".join(words[i:i+4])
            if window in clean_tr:
                return True
    return False

def audit_dataset():
    dataset_path = os.path.join("backend", "dataset_limpo.json")
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found at {dataset_path}")

    # Create timestamped backup immediately (Part 12)
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join("backend", f"dataset_limpo.backup.{timestamp_str}.json")
    shutil.copyfile(dataset_path, backup_path)
    print(f"Created dataset backup at: {backup_path}")

    with open(dataset_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    total_records = len(records)
    records_with_transcript = 0
    records_empty_or_short_transcript = 0
    records_with_resumo = 0
    records_short_with_resumo = 0

    total_tasks = 0
    tasks_with_valid_evidence_literal = 0
    tasks_with_invalid_evidence = 0
    tasks_marked_valid_with_missing_evidence = 0

    total_decisions = 0
    concrete_decisions = 0
    generic_or_discussion_decisions = 0

    total_placeholders_found = 0
    placeholder_breakdown = {}

    total_totvs_recommendations = 0
    totvs_recommendations_with_validated_pain = 0
    totvs_recommendations_without_validated_pain = 0

    audit_details = []

    for r in records:
        rec_id = r.get("ID_MEETING")
        transcricao = (r.get("ANON_TRANSCRICAO") or r.get("TRANSCRIPT_FINAL") or r.get("TRANSCRIPT_NORMALIZED") or "").strip()
        word_count = len(transcricao.split()) if transcricao else 0
        char_count = len(transcricao)

        has_trans = char_count > 0
        is_short_or_empty = (char_count < MIN_TRANSCRIPT_CHARS or word_count < MIN_TRANSCRIPT_WORDS)

        if has_trans:
            records_with_transcript += 1
        if is_short_or_empty:
            records_empty_or_short_transcript += 1

        resumo = r.get("RESUMO_IA")
        resumo_exec = r.get("RESUMO_EXECUTIVO")
        has_analysis = bool(resumo or resumo_exec)

        if has_analysis:
            records_with_resumo += 1
            if is_short_or_empty:
                records_short_with_resumo += 1

        rec_audit = {
            "id": rec_id,
            "char_count": char_count,
            "word_count": word_count,
            "is_short_or_empty": is_short_or_empty,
            "has_resumo": has_analysis,
            "tasks_count": 0,
            "tasks_literal_valid": 0,
            "tasks_literal_invalid": 0,
            "placeholders": [],
            "totvs_recs_count": 0
        }

        # Scan text in whole record for placeholders
        rec_text = json.dumps(r, ensure_ascii=False)
        placeholders_in_rec = PLACEHOLDER_REGEX.findall(rec_text)
        if placeholders_in_rec:
            total_placeholders_found += len(placeholders_in_rec)
            for p in placeholders_in_rec:
                placeholder_breakdown[p.upper()] = placeholder_breakdown.get(p.upper(), 0) + 1
            rec_audit["placeholders"] = placeholders_in_rec

        if isinstance(resumo, dict):
            # Tasks audit
            tasks = resumo.get("tarefas", [])
            rec_audit["tasks_count"] = len(tasks)
            total_tasks += len(tasks)

            # Check pains in resumo
            resumo_pains = resumo.get("dores", [])
            valid_pains_texts = []
            for p in resumo_pains:
                trecho = p.get("trecho") or p.get("descricao") or ""
                if check_evidence_in_transcript(trecho, transcricao):
                    valid_pains_texts.append(trecho)

            for t in tasks:
                ev = t.get("evidencia") or t.get("evidence") or ""
                validation_status = t.get("task_validation_status", "")
                is_literal_found = check_evidence_in_transcript(ev, transcricao)

                if is_literal_found:
                    tasks_with_valid_evidence_literal += 1
                    rec_audit["tasks_literal_valid"] += 1
                else:
                    tasks_with_invalid_evidence += 1
                    rec_audit["tasks_literal_invalid"] += 1
                    if validation_status == "valid":
                        tasks_marked_valid_with_missing_evidence += 1

            # Decisions audit (from organizacao_por_temas or resumo_executivo)
            temas = resumo.get("organizacao_por_temas", [])
            for tm in temas:
                topicos = tm.get("topicos", [])
                for top in topicos:
                    texto_top = str(top).strip()
                    if any(w in texto_top.lower() for w in ["decidid", "definid", "aprovad", "alinhad", "combinad", "acordad"]):
                        total_decisions += 1
                        # Concrete if mentions responsible, action, or firm agreement
                        if any(w in texto_top.lower() for w in ["ficou definido que", "aprovado por", "decidido que", "será feito", "alinhado entre"]):
                            concrete_decisions += 1
                        else:
                            generic_or_discussion_decisions += 1

            # TOTVS Recommendations audit
            recs = resumo.get("recomendacoes_totvs", [])
            rec_audit["totvs_recs_count"] = len(recs)
            total_totvs_recommendations += len(recs)
            for rec_item in recs:
                # Check if trigger_pains or any pain was validated
                trigger_pains = rec_item.get("trigger_pains", [])
                has_valid_pain = False
                for tp in trigger_pains:
                    if check_evidence_in_transcript(str(tp), transcricao):
                        has_valid_pain = True
                        break
                if not has_valid_pain and valid_pains_texts:
                    # check if any validated pain exists
                    has_valid_pain = True

                if has_valid_pain:
                    totvs_recommendations_with_validated_pain += 1
                else:
                    totvs_recommendations_without_validated_pain += 1

        audit_details.append(rec_audit)

    baseline_metrics = {
        "timestamp": datetime.now().isoformat(),
        "backup_path": backup_path,
        "dataset_path": dataset_path,
        "total_records": total_records,
        "records_with_transcript": records_with_transcript,
        "records_empty_or_short_transcript": records_empty_or_short_transcript,
        "records_with_resumo": records_with_resumo,
        "records_short_with_resumo": records_short_with_resumo,
        "total_tasks": total_tasks,
        "tasks_with_valid_evidence_literal": tasks_with_valid_evidence_literal,
        "tasks_with_invalid_evidence": tasks_with_invalid_evidence,
        "tasks_marked_valid_with_missing_evidence": tasks_marked_valid_with_missing_evidence,
        "total_decisions_detected": total_decisions,
        "concrete_decisions": concrete_decisions,
        "generic_or_discussion_decisions": generic_or_discussion_decisions,
        "total_placeholders_found": total_placeholders_found,
        "placeholder_breakdown": placeholder_breakdown,
        "total_totvs_recommendations": total_totvs_recommendations,
        "totvs_recommendations_with_validated_pain": totvs_recommendations_with_validated_pain,
        "totvs_recommendations_without_validated_pain": totvs_recommendations_without_validated_pain,
    }

    # Ensure artifacts directory exists
    os.makedirs(os.path.join("artifacts", "evaluation"), exist_ok=True)
    metrics_file = os.path.join("artifacts", "evaluation", "baseline_metrics.json")
    with open(metrics_file, "w", encoding="utf-8") as f:
        json.dump(baseline_metrics, f, indent=2, ensure_ascii=False)

    print("\n--- BASELINE METRICS SUMMARY ---")
    for k, v in baseline_metrics.items():
        print(f"  {k}: {v}")
    print(f"\nBaseline metrics written to: {metrics_file}")
    return baseline_metrics

if __name__ == "__main__":
    audit_dataset()
