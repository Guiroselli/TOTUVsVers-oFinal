import os
import glob
import csv

downloads_dir = r"C:\Users\lucas\Downloads"
csv_candidates = glob.glob(os.path.join(downloads_dir, "*Proton*50*")) + glob.glob(os.path.join(downloads_dir, "*50*situa*"))
target_csv = csv_candidates[0]

with open(target_csv, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    headers = next(reader)
    rows = list(reader)

for col_idx in range(3, len(headers)):
    header = headers[col_idx]
    col_values = set(row[col_idx].strip() for row in rows if col_idx < len(row))
    print(f"\nCol {col_idx}: {header}")
    for val in sorted(col_values):
        print(f"  - {val[:120]}")
    if col_idx >= 8:  # sample first 6 situations
        break
