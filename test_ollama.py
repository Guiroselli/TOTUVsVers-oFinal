import json
import requests
import sys

def test_ollama():
    try:
        with open("backend/dataset_limpo.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            
        if not data:
            print("Dataset is empty!")
            return
            
        first_meeting = data[0]
        text = first_meeting.get("ANON_TRANSCRICAO", "")
        
        # truncate text as frontend does
        text = text[:15000]
        
        print(f"Testing Ollama with transcript length: {len(text)}")
        
        SYSTEM_PROMPT = """
Você é um assistente executivo da TOTVS (Proton Flow). O usuário vai enviar a transcrição de uma reunião corporativa.
Sua missão é extrair dados estruturados e resumi-los de forma EXTREMAMENTE clara e organizada.
Analise o texto e retorne APENAS um JSON estrito, sem formatação markdown ou blocos de código (não use ```json). Retorne apenas o objeto no seguinte formato exato:
{
    "tema": "Título curto e claro da reunião",
    "contexto": {
        "problema": "O problema principal discutido",
        "decisao": "Decisão ou encaminhamento principal"
    },
    "organizacao_por_temas": [
        {
            "tema": "Nome do Tema (ex: Financeiro, Desenvolvimento, Comercial, RH, Produto, etc)",
            "topicos": [
                "Tópico 1 discutido dentro deste tema",
                "Tópico 2 discutido dentro deste tema"
            ]
        }
    ],
    "tarefas": [
        {
            "responsavel": "Nome",
            "tarefa": "Ação a ser feita",
            "prazo": "Prazo, se houver"
        }
    ],
    "dores": [
        "Problemas ou dores apontadas na operação"
    ]
}
Não escreva NENHUM texto fora deste JSON. Se não houver dados para alguma chave, retorne array vazio [] ou string vazia "".
"""
        
        payload = {
            "model": "llama3",
            "prompt": text[:8000], # Reduce slightly for safety, or leave as text
            "system": SYSTEM_PROMPT,
            "stream": False,
            "format": "json",
            "options": {
                "num_ctx": 8192
            }
        }
        
        resp = requests.post("http://localhost:11434/api/generate", json=payload)
        print("Status Code:", resp.status_code)
        resp_json = resp.json()
        print("Raw Ollama Response:")
        print(resp_json.get("response"))
        
        print("\nParsed JSON:")
        parsed = json.loads(resp_json.get("response"))
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_ollama()
