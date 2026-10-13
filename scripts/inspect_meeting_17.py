import json

with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
    data = json.load(f)

m17 = next(m for m in data if str(m.get("ID_MEETING")) == "1247082")
res = m17.get("RESUMO_IA")
print("Meeting 17 RESUMO_IA summary:")
print("Tema:", res.get("tema"))
print("Tarefas count:", len(res.get("tarefas", [])))
for t in res.get("tarefas", [])[:3]:
    print("  Task:", t.get("tarefa"))
    print("  Responsavel:", t.get("responsavel"))
    print("  Evidencia:", t.get("evidencia"))
    print("  Validation status:", t.get("task_validation_status"))

print("\nDores count:", len(res.get("dores", [])))
for d in res.get("dores", [])[:3]:
    print("  Dor label:", d.get("label"))
    print("  Dor trecho:", d.get("trecho"))
    print("  Sistema:", d.get("sistema_totvs"))

print("\nRecomendacoes TOTVS count:", len(res.get("recomendacoes_totvs", [])))
for r in res.get("recomendacoes_totvs", [])[:3]:
    print("  Product:", r.get("product_name"))
    print("  Why:", r.get("why_recommended"))
