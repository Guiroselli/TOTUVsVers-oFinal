import os
import re
import json
import sys

# Adiciona o backend ao path para reaproveitar normalizações
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from normalization import normalize_date_iso, normalize_client_code, normalize_urgency


def parse_meetings(csv_path: str = 'ANON_nome_transcricao.csv', output_json: str = 'backend/dataset_limpo.json'):
    print(f"Iniciando parser completo de reuniões a partir de: {csv_path}...")
    
    if not os.path.exists(csv_path):
        print(f"Arquivo {csv_path} não encontrado no diretório raiz. Nenhuma alteração feita.")
        return
        
    with open(csv_path, 'r', encoding='iso-8859-1') as f:
        lines = f.readlines()
        
    print(f"Total de linhas brutas no arquivo: {len(lines)}")
    
    # Regex para identificar o início de cada reunião (qualquer tamanho de ID numérico com ou sem aspas)
    new_meeting_pattern = re.compile(r'^"?(\d+)"?,"?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})"?,')
    
    meetings = []
    current_meeting = None
    current_transcription = []
    
    for i, line in enumerate(lines):
        if i == 0:
            continue  # Pula o cabeçalho
            
        match = new_meeting_pattern.match(line)
        if match:
            if current_meeting:
                current_meeting["ANON_TRANSCRICAO"] = "\n".join(current_transcription).replace('"', '').strip()
                meetings.append(current_meeting)
                
            parts = line.split(',', 10)
            
            raw_date = parts[1].replace('"', '').strip() if len(parts) > 1 else ""
            iso_date = normalize_date_iso(raw_date) or raw_date
            
            client_code = parts[6].replace('"', '').strip() if len(parts) > 6 else ""
            
            current_meeting = {
                "ID_MEETING": str(parts[0]).replace('"', '').strip(),
                "DT_MEETING": iso_date,
                "FORMATO_MEETING": parts[2].replace('"', '').strip() if len(parts) > 2 else "VIDEO",
                "DURACAO_MEETING": parts[5].replace('"', '').strip() if len(parts) > 5 else "",
                "STATUS_MEETING": parts[4].replace('"', '').strip() if len(parts) > 4 else "COMPLETED",
                "NOME_SEGMENTO": normalize_client_code(client_code),
                "NIVEL_URGENCIA": "Não Definido",
                "RESPONSAVEL_REUNIAO": "",
                "TEM_PDF": False
            }
            current_transcription = []
            
            if len(parts) > 10:
                transcription_start = parts[10].strip()
                if transcription_start:
                    current_transcription.append(transcription_start)
        else:
            if current_meeting:
                current_transcription.append(line.strip())
                
    if current_meeting:
        current_meeting["ANON_TRANSCRICAO"] = "\n".join(current_transcription).replace('"', '').strip()
        meetings.append(current_meeting)
        
    print(f"Sucesso! Encontradas {len(meetings)} reuniões distintas (sem limitação de amostragem).")
    
    # Preserva análises já existentes se o arquivo de destino já existir
    existing_analyses = {}
    if os.path.exists(output_json):
        try:
            with open(output_json, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
            for m in old_data:
                m_id = str(m.get("ID_MEETING"))
                if "RESUMO_IA" in m:
                    existing_analyses[m_id] = {
                        "RESUMO_IA": m.get("RESUMO_IA"),
                        "RESPONSAVEL_REUNIAO": m.get("RESPONSAVEL_REUNIAO"),
                        "NIVEL_URGENCIA": m.get("NIVEL_URGENCIA"),
                        "TEM_PDF": m.get("TEM_PDF", False),
                        "field_suggestions": m.get("field_suggestions")
                    }
        except Exception as e:
            print(f"Aviso ao ler dataset existente: {e}")

    for m in meetings:
        m_id = str(m.get("ID_MEETING"))
        if m_id in existing_analyses:
            m.update(existing_analyses[m_id])

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(meetings, f, ensure_ascii=False, indent=2)
        
    print(f"Salvas {len(meetings)} reuniões em {output_json} com normalização ISO 8601.")


if __name__ == '__main__':
    parse_meetings()
