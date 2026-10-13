import json

with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for m in data[7:11]:
    print(f"\nID: {m.get('ID_MEETING')}")
    print(f"Transcript: {m.get('ANON_TRANSCRICAO')}")
    res = m.get("RESUMO_IA")
    if res:
        print(f"Resumo tema: {res.get('tema')}")
        print(f"Tarefas: {res.get('tarefas')}")
        print(f"Dores: {res.get('dores')}")
