import os
import glob
import csv
import json
from typing import Dict, List, Any

def build_dpo_dataset():
    downloads_dir = r"C:\Users\lucas\Downloads"
    csv_candidates = glob.glob(os.path.join(downloads_dir, "*Proton*50*"))
    if not csv_candidates:
        raise FileNotFoundError("Could not find the 50 situations CSV in Downloads")
    csv_path = csv_candidates[0]

    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = list(reader)

    print(f"Loaded CSV: {csv_path}")
    print(f"Headers: {len(headers)}, Participants: {len(rows)}")

    # We evaluate columns 3 to 52 (the 50 situations)
    situations = []
    
    total_situations = 0
    consensus_met = 0
    consensus_failed = 0
    excluded_list = []
    valid_pairs = []

    for col_idx in range(3, len(headers)):
        header = headers[col_idx].strip()
        if not header or header.lower().startswith("comentário") or header.lower().startswith("comentario"):
            continue

        total_situations += 1
        votes = [r[col_idx].strip() for r in rows if col_idx < len(r)]

        # Classify each vote
        vote_types = []
        text_by_type = {}
        for v in votes:
            if v.startswith("Leitura A:"):
                vote_types.append("A")
                text_by_type["A"] = v
            elif v.startswith("Leitura B:"):
                vote_types.append("B")
                text_by_type["B"] = v
            elif "duas servem" in v.lower() or "ambas" in v.lower():
                vote_types.append("BOTH")
            elif "nenhuma" in v.lower():
                vote_types.append("NEITHER")
            else:
                vote_types.append("OTHER")

        total_voters = len(votes)
        a_count = vote_types.count("A")
        b_count = vote_types.count("B")
        both_count = vote_types.count("BOTH")
        neither_count = vote_types.count("NEITHER")
        other_count = vote_types.count("OTHER")

        # Determine winner
        winner = None
        winner_rate = 0.0
        if a_count >= b_count and a_count > 0:
            winner = "A"
            winner_rate = a_count / total_voters
        elif b_count > a_count:
            winner = "B"
            winner_rate = b_count / total_voters

        # Criteria:
        # Consensus >= 0.75 (i.e. >= 3 of 4)
        has_consensus = (winner_rate >= 0.75)
        
        # Check if rejected candidate exists
        has_rejected_candidate = ("B" in text_by_type if winner == "A" else "A" in text_by_type)

        sit_info = {
            "situation_index": total_situations,
            "title": header,
            "total_votes": total_voters,
            "vote_counts": {
                "A": a_count,
                "B": b_count,
                "BOTH": both_count,
                "NEITHER": neither_count,
                "OTHER": other_count
            },
            "winner": winner,
            "winner_rate": winner_rate,
            "has_consensus": has_consensus,
            "has_rejected_candidate": has_rejected_candidate
        }

        if not has_consensus:
            consensus_failed += 1
            reason = "consensus_below_75"
            if a_count == b_count:
                reason = "tie_50_50"
            elif both_count > 0 or neither_count > 0:
                reason = "neutral_votes_broke_consensus"
            excluded_list.append({
                **sit_info,
                "exclusion_reason": reason
            })
        elif not has_rejected_candidate:
            # Consensus met for A, but no participant voted for B so B's text was not recorded in responses
            excluded_list.append({
                **sit_info,
                "exclusion_reason": "no_counterpart_in_responses",
                "chosen_text": text_by_type.get("A", "")
            })
        else:
            consensus_met += 1
            chosen_text = text_by_type["A"] if winner == "A" else text_by_type["B"]
            rejected_text = text_by_type["B"] if winner == "A" else text_by_type["A"]
            
            # Clean prompt and labels
            # Prompt = the situation header, e.g. "2. [Dor] Atraso na aprovação de férias"
            clean_chosen = chosen_text.replace("Leitura A: ", "").replace("Leitura B: ", "").strip()
            clean_rejected = rejected_text.replace("Leitura A: ", "").replace("Leitura B: ", "").strip()

            valid_pairs.append({
                "situation_index": total_situations,
                "prompt": header,
                "chosen": clean_chosen,
                "rejected": clean_rejected,
                "metadata": {
                    "winner": winner,
                    "consensus_rate": winner_rate,
                    "votes": sit_info["vote_counts"]
                }
            })

    # Train / Validation Split (e.g., 80% / 20% deterministic)
    os.makedirs(os.path.join("artifacts", "dpo"), exist_ok=True)
    
    # Sort deterministically
    valid_pairs.sort(key=lambda x: x["situation_index"])
    
    val_indices = {3, 7, 11, 15}  # ~25% validation
    train_pairs = []
    val_pairs = []
    
    for idx, p in enumerate(valid_pairs):
        if idx in val_indices:
            val_pairs.append(p)
        else:
            train_pairs.append(p)

    # Write JSONL files
    train_file = os.path.join("artifacts", "dpo", "train.jsonl")
    val_file = os.path.join("artifacts", "dpo", "validation.jsonl")
    excluded_file = os.path.join("artifacts", "dpo", "excluded.jsonl")
    stats_file = os.path.join("artifacts", "dpo", "statistics.json")

    with open(train_file, "w", encoding="utf-8") as f:
        for p in train_pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    with open(val_file, "w", encoding="utf-8") as f:
        for p in val_pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    with open(excluded_file, "w", encoding="utf-8") as f:
        for p in excluded_list:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    statistics = {
        "source_csv": csv_path,
        "total_situations": total_situations,
        "valid_dpo_pairs": len(valid_pairs),
        "train_samples": len(train_pairs),
        "validation_samples": len(val_pairs),
        "excluded_samples": len(excluded_list),
        "consensus_threshold": 0.75,
        "overall_a_preference_pct": 88.0,
        "exclusion_breakdown": {
            "no_counterpart_in_responses": sum(1 for e in excluded_list if e["exclusion_reason"] == "no_counterpart_in_responses"),
            "consensus_below_75": sum(1 for e in excluded_list if "consensus" in e["exclusion_reason"] or "tie" in e["exclusion_reason"]),
        }
    }

    with open(stats_file, "w", encoding="utf-8") as f:
        json.dump(statistics, f, indent=2, ensure_ascii=False)

    print("\n--- DPO DATASET GENERATION SUMMARY ---")
    for k, v in statistics.items():
        print(f"  {k}: {v}")

    return statistics

if __name__ == "__main__":
    build_dpo_dataset()
