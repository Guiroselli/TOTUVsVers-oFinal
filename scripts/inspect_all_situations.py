import os
import glob
import csv
import json

downloads_dir = r"C:\Users\lucas\Downloads"
csv_candidates = glob.glob(os.path.join(downloads_dir, "*Proton*50*")) + glob.glob(os.path.join(downloads_dir, "*50*situa*"))
target_csv = csv_candidates[0]

with open(target_csv, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    headers = next(reader)
    rows = list(reader)

all_situations = []
for col_idx in range(3, len(headers)):
    header = headers[col_idx]
    responses = [r[col_idx].strip() for r in rows if col_idx < len(r)]
    all_situations.append({
        "index": col_idx - 2,
        "title": header,
        "responses": responses
    })

print(f"Total situations parsed: {len(all_situations)}")
for s in all_situations[:10]:
    print(f"\n[{s['index']}] {s['title']}")
    for r in set(s['responses']):
        print(f"   Option: {r}")
