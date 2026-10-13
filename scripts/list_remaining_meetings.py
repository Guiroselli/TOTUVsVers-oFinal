import json

with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for i, m in enumerate(data[15:]):
    idx = i + 16
    title = m.get("TITULO_REUNIAO")
    t = m.get("ANON_TRANSCRICAO") or ""
    has_res = bool(m.get("RESUMO_IA"))
    print(f"[{idx}] {m.get('ID_MEETING')}: {str(title)[:30]} | Chars: {len(t)} | Words: {len(t.split())} | Res: {has_res}")
