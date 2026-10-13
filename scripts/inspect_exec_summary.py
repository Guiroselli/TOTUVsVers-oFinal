import json

with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

execs = [r.get("RESUMO_EXECUTIVO") for r in data if r.get("RESUMO_EXECUTIVO")]
print(f"Total records with RESUMO_EXECUTIVO: {len(execs)}")
if execs:
    sample = execs[0]
    print(f"RESUMO_EXECUTIVO type: {type(sample)}")
    if isinstance(sample, dict):
        print(f"Keys: {list(sample.keys())}")
        for k, v in sample.items():
            print(f"  {k}: {repr(v)[:150]}")
    else:
        print(f"Content preview: {str(sample)[:300]}")

# Also check RESUMO_IA['resumo_executivo']
ia_execs = [r["RESUMO_IA"].get("resumo_executivo") for r in data if r.get("RESUMO_IA") and r["RESUMO_IA"].get("resumo_executivo")]
print(f"\nTotal records with RESUMO_IA.resumo_executivo: {len(ia_execs)}")
if ia_execs:
    print(f"Sample RESUMO_IA.resumo_executivo keys: {list(ia_execs[0].keys()) if isinstance(ia_execs[0], dict) else type(ia_execs[0])}")
    print(f"Sample content: {ia_execs[0]}")
