import pandas as pd
import json

def parse_meeting():
    print("Lendo CSV como texto bruto...")
    
    # Como as quebras de linha estragaram o formato CSV padrão, vamos ler como texto bruto
    with open('ANON_nome_transcricao.csv', 'r', encoding='latin1') as f:
        lines = f.readlines()
        
    print(f"Total de linhas brutas: {len(lines)}")
    
    # A primeira linha é o cabeçalho
    # A segunda linha contém os metadados antes da transcrição começar
    # Exemplo: 1247082,2026-03-18 16:00:00,VIDEO,3,COMPLETED,01:39:13,T27261,,true,2026-03-13 16:47:22,"[LOCUTOR 102]: ...
    
    header = lines[0].strip().split(',')
    
    # Tentar extrair os metadados da segunda linha
    # Sabendo que a transcrição começa depois da 10ª vírgula (DT_CRIACAO)
    first_data_line = lines[1]
    
    # Split by comma mas apenas nas primeiras 10 virgulas
    parts = first_data_line.split(',', 10)
    
    meeting_data = {
        "ID_MEETING": parts[0] if len(parts) > 0 else "Desconhecido",
        "DT_MEETING": parts[1] if len(parts) > 1 else "",
        "FORMATO_MEETING": parts[2] if len(parts) > 2 else "",
        "DURACAO_MEETING": parts[5] if len(parts) > 5 else "01:39:13",
        "STATUS_MEETING": parts[4] if len(parts) > 4 else ""
    }
    
    # A transcrição é o resto da linha 1 + todas as outras linhas
    transcricao_parts = []
    if len(parts) > 10:
        transcricao_parts.append(parts[10])
        
    for i in range(2, len(lines)):
        transcricao_parts.append(lines[i])
        
    full_transcription = "".join(transcricao_parts).replace('"', '').strip()
    
    meeting_data["ANON_TRANSCRICAO"] = full_transcription
    
    # Como 46MB de texto é enorme para a tela e para a IA, vamos salvar tudo,
    # mas o frontend deve fatiar se for mandar para a IA.
    
    with open('backend/dataset_limpo.json', 'w', encoding='utf-8') as f:
        # Colocamos dentro de um array para não quebrar a compatibilidade com o frontend atual que espera um array
        json.dump([meeting_data], f, ensure_ascii=False, indent=2)
        
    print("reuniao_unica extraída e salva em dataset_limpo.json!")

if __name__ == '__main__':
    parse_meeting()
