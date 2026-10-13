import os
import glob
import csv

downloads_dir = r"C:\Users\lucas\Downloads"
csv_candidates = glob.glob(os.path.join(downloads_dir, "*Proton*50*"))
target_csv = csv_candidates[0]

with open(target_csv, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    headers = next(reader)
    rows = list(reader)

print(f"Total situations in CSV: {len(headers) - 4}")
for i in range(3, len(headers) - 1):
    header = headers[i]
    votes = [r[i].strip() for r in rows if i < len(r)]
    print(f"\n--- Situation {i-2}: {header} ---")
    for participant_idx, v in enumerate(votes):
        print(f"  P{participant_idx+1}: {v}")
