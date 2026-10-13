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

situations = []
for col_idx in range(3, len(headers)):
    header = headers[col_idx]
    responses = [r[col_idx].strip() for r in rows if col_idx < len(r)]
    unique_choices = set(responses)
    
    a_opts = [c for c in unique_choices if c.startswith("Leitura A")]
    b_opts = [c for c in unique_choices if c.startswith("Leitura B")]
    
    situations.append({
        "col_idx": col_idx,
        "title": header,
        "all_responses": responses,
        "unique_choices": list(unique_choices),
        "a_opt": a_opts[0] if a_opts else None,
        "b_opt": b_opts[0] if b_opts else None
    })

print(f"Total situations: {len(situations)}")
has_both = sum(1 for s in situations if s["a_opt"] and s["b_opt"])
has_only_a = sum(1 for s in situations if s["a_opt"] and not s["b_opt"])
print(f"Situations with both A and B chosen by at least one participant: {has_both}")
print(f"Situations where only A (or A + Both/Neither) was chosen: {has_only_a}")

for s in situations:
    if not s["b_opt"]:
        print(f"Col {s['col_idx']}: {s['title']} -> {s['unique_choices']}")
