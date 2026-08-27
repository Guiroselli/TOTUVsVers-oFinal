import requests
import json
import os
import time

BASE_URL = "http://127.0.0.1:8000"

def get_meeting_for_client(client_code):
    with open("dataset_limpo.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    for m in data:
        if m.get("NOME_SEGMENTO") == client_code:
            return m
    return None

def test_1():
    print("--- Teste 1: Slide 11 ---")
    client_code = "T27261"
    meeting = get_meeting_for_client(client_code)
    if not meeting:
        print("Cliente T27261 não encontrado no dataset.")
        return
    
    transcript = "Reunião de teste para o cliente. Estamos com problemas na aprovação pendente. O sistema está muito lento."
    meeting_id = meeting["ID_MEETING"]
    
    # 1. Processar uma reunião
    print("Enviando primeira reunião para análise...")
    res = requests.post(f"{BASE_URL}/api/analyze", json={"text": transcript, "meeting_id": meeting_id})
    print(f"Status 1: {res.status_code}")
    
    # 2. Verificar perfis_clientes.json
    time.sleep(1)
    if os.path.exists("perfis_clientes.json"):
        with open("perfis_clientes.json", "r", encoding="utf-8") as f:
            perfis = json.load(f)
            if client_code in perfis:
                print(f"Perfil {client_code} criado com sucesso.")
                print(f"Reuniões no perfil: {len(perfis[client_code]['reunioes'])}")
            else:
                print("Perfil não foi criado para o cliente.")
    else:
        print("Arquivo perfis_clientes.json não foi criado.")
        
    # 3. Processar segunda reunião para o mesmo cliente
    print("Enviando segunda reunião para análise...")
    transcript2 = "Nova reunião com o cliente. Ainda não resolveram e o documento faltando é um problema crítico."
    res2 = requests.post(f"{BASE_URL}/api/analyze", json={"text": transcript2, "meeting_id": meeting_id})
    print(f"Status 2: {res2.status_code}")
    
    # Check perfil again
    with open("perfis_clientes.json", "r", encoding="utf-8") as f:
        perfis = json.load(f)
        n = len(perfis[client_code]['reunioes'])
        print(f"Reuniões no perfil após 2 envios: {n}")
        if n >= 2:
            print("Histórico atualizado com sucesso!")
            
def test_2():
    print("\n--- Teste 2: Slide 12 ---")
    transcript = "Temos um problema onde quem aprova não respondeu, estamos com atraso na entrega, e o cliente não ficou satisfeito."
    print("Enviando reunião com gatilhos...")
    # Generate a dummy meeting using /api/save_meeting
    res_save = requests.post(f"{BASE_URL}/api/save_meeting", json={"transcript": transcript})
    meeting_id = res_save.json()["meeting_id"]
    
    res = requests.post(f"{BASE_URL}/api/analyze", json={"text": transcript, "meeting_id": meeting_id})
    if res.status_code == 200:
        data = res.json()
        dores = data.get("dores", [])
        print(f"Dores detectadas: {len(dores)}")
        for d in dores:
            print(f"- {d.get('categoria')}: {d.get('descricao')} -> '{d.get('trecho')}'")
    else:
        print("Falha ao analisar.")

def test_3():
    print("\n--- Teste 3: Slide 13 ---")
    meeting_id = "test-meeting-id"
    tarefas = [{"responsavel": "João", "tarefa": "Revisar docs", "prazo": "amanhã"}]
    
    print("Simulando clique no botão Fluig...")
    res = requests.post(f"{BASE_URL}/api/integracoes/enviar", json={
        "sistema": "fluig",
        "meeting_id": meeting_id,
        "tarefas": tarefas
    })
    print(f"Response: {res.json()}")
    
    print("Verificando integracoes_totvs.json...")
    if os.path.exists("integracoes_totvs.json"):
        with open("integracoes_totvs.json", "r", encoding="utf-8") as f:
            log = json.load(f)
            print(f"Status do log: {log[0]['status']}")
    
    print("Verificando sistemas disponíveis (Ecossistema TOTVS)...")
    res_sistemas = requests.get(f"{BASE_URL}/api/integracoes/sistemas")
    print(f"Sistemas: {list(res_sistemas.json().keys())}")

if __name__ == '__main__':
    test_1()
    test_2()
    test_3()
