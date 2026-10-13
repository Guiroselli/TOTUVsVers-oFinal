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

print(f"Headers count: {len(headers)}")
print(f"Participants count: {len(rows)}")

# Analyze votes across situations (columns 3 to 52)
results = []
for col_idx in range(3, len(headers)):
    header = headers[col_idx]
    votes = [row[col_idx].strip() for row in rows if col_idx < len(row)]
    
    # Analyze options chosen
    vote_summary = {}
    for v in votes:
        opt = "Unknown"
        if v.startswith("Leitura A"):
            opt = "A"
        elif v.startswith("Leitura B"):
            opt = "B"
        elif "ambas" in v.lower() or "duas" in v.lower():
            opt = "Both"
        elif "nenhuma" in v.lower():
            opt = "Neither"
        else:
            opt = v[:30]
        vote_summary[opt] = vote_summary.get(opt, 0) + 1
    
    total_votes = len(votes)
    winner = max(vote_summary.items(), key=lambda x: x[1]) if vote_summary else ("None", 0)
    consensus_rate = winner[1] / total_votes if total_votes > 0 else 0
    
    results.append({
        "col_idx": col_idx,
        "situation": header,
        "votes": votes,
        "summary": vote_summary,
        "winner": winner[0],
        "winner_count": winner[1],
        "total_votes": total_votes,
        "consensus_rate": consensus_rate
    })

print("\n--- Preference Summary of 50 Situations ---")
a_count = 0
b_count = 0
tie_or_other = 0
consensus_ge_75 = 0

for r in results:
    if r["winner"] == "A" and r["consensus_rate"] >= 0.75:
        a_count += 1
    elif r["winner"] == "B" and r["consensus_rate"] >= 0.75:
        b_count += 1
    else:
        tie_or_other += 1
    if r["consensus_rate"] >= 0.75:
        consensus_ge_75 += 1

print(f"Consensus >= 75%: {consensus_ge_75} / {len(results)}")
print(f"A winners (consensus >= 75%): {a_count}")
print(f"B winners (consensus >= 75%): {b_count}")
print(f"Ties or < 75%: {tie_or_other}")

print("\nSample situation 1:")
print(f"  Title: {results[0]['situation']}")
print(f"  Summary: {results[0]['summary']}")
for i, v in enumerate(results[0]['votes']):
    print(f"  Participant {i+1}: {v[:100]}...")
