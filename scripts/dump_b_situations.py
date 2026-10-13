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

for i in range(3, len(headers) - 1):
    header = headers[i]
    votes = [r[i].strip() for r in rows if i < len(r)]
    b_votes = [v for v in votes if v.startswith("Leitura B")]
    if b_votes:
        a_votes = [v for v in votes if v.startswith("Leitura A")]
        print(f"\nSituation {i-2}: {header}")
        print(f"  Chosen (A): {a_votes[0] if a_votes else 'None'}")
        print(f"  Rejected (B): {b_votes[0]}")
