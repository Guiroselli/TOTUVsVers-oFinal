import json
with open('backend/dataset_limpo.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for i in range(3):
    text = data[i].get('ANON_TRANSCRICAO', '')
    print(f"Meeting {i}: Length = {len(text)}, Text Preview = {text[:100]}")
