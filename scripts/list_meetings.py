import json

with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total meetings: {len(data)}")
for i, m in enumerate(data[:15]):
    title = m.get("TITULO_REUNIAO")
    has_t = bool(m.get("ANON_TRANSCRICAO"))
    t_len = len(m.get("ANON_TRANSCRICAO") or "")
    has_res = bool(m.get("RESUMO_IA"))
    print(f"[{i+1}] {m.get('ID_MEETING')}: {title} | Trans: {has_t} ({t_len} chars) | Resumo: {has_res}")
