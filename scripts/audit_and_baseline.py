import os
import json
import re
import glob
import csv
from datetime import datetime

def inspect_details():
    downloads_dir = r"C:\Users\lucas\Downloads"
    csv_candidates = glob.glob(os.path.join(downloads_dir, "*Proton*50*")) + glob.glob(os.path.join(downloads_dir, "*50*situa*"))
    target_csv = csv_candidates[0] if csv_candidates else None
    print(f"Target CSV: {target_csv}")

    if target_csv and os.path.exists(target_csv):
        with open(target_csv, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            print(f"\nCSV Headers count: {len(headers)}")
            print("First 10 headers:")
            for i, h in enumerate(headers[:10]):
                print(f"  [{i}] {h[:80]}")
            row_count = 0
            sample_rows = []
            for row in reader:
                row_count += 1
                if len(sample_rows) < 2:
                    sample_rows.append(row)
            print(f"Total rows in CSV: {row_count}")
            if sample_rows:
                print("\nSample Row 1 (first 5 cols):")
                for i, c in enumerate(sample_rows[0][:5]):
                    print(f"  col[{i}] = {c[:80]}")

    dataset_path = os.path.join("backend", "dataset_limpo.json")
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"\nDataset total records: {len(data)}")
    has_resumo = [r for r in data if r.get("RESUMO_IA")]
    has_transcricao = [r for r in data if (r.get("ANON_TRANSCRICAO") or r.get("TRANSCRIPT_FINAL") or r.get("TRANSCRIPT_NORMALIZED"))]
    print(f"Records with RESUMO_IA: {len(has_resumo)}")
    print(f"Records with any transcription: {len(has_transcricao)}")

    if has_resumo:
        sample_res = has_resumo[0]["RESUMO_IA"]
        print(f"\nSample RESUMO_IA keys/type: {type(sample_res)} - {list(sample_res.keys()) if isinstance(sample_res, dict) else sample_res[:100]}")
        if isinstance(sample_res, dict):
            for k, v in sample_res.items():
                if isinstance(v, list):
                    print(f"  key '{k}': list of {len(v)} items")
                    if v and isinstance(v[0], dict):
                        print(f"    sample item keys: {list(v[0].keys())}")
                else:
                    print(f"  key '{k}': {type(v).__name__}")

if __name__ == "__main__":
    inspect_details()
