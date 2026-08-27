import os
import sys
import json
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from normalization import normalize_date_iso, normalize_client_code, normalize_urgency


def main():
    csv_file = 'ANON_nome_transcricao.csv'
    if not os.path.exists(csv_file):
        print(f"{csv_file} não encontrado. Operação ignorada.")
        return

    print("Lendo CSV...")
    try:
        df = pd.read_csv(csv_file, encoding='latin1', on_bad_lines='skip', sep=';')
        if len(df.columns) < 5:
            df = pd.read_csv(csv_file, encoding='latin1', on_bad_lines='skip', sep=',')
    except Exception as e:
        print(f"Erro ao ler CSV: {e}")
        return
    
    print(f"Total de linhas lidas: {len(df)}")
    
    colunas_desejadas = ['ID_MEETING', 'DT_MEETING', 'DURACAO_MEETING', 'STATUS_MEETING', 'FORMATO_MEETING', 'NOME_SEGMENTO', 'NOTA_NPS', 'ANON_TRANSCRICAO']
    colunas_presentes = [col for col in colunas_desejadas if col in df.columns]
    df = df[colunas_presentes]
    
    if 'ANON_TRANSCRICAO' in df.columns:
        df = df.dropna(subset=['ANON_TRANSCRICAO'])
        df = df[df['ANON_TRANSCRICAO'].str.len() > 15]
    
    # Importa TODAS as reuniões disponíveis (sem truncamento em 30)
    records = df.fillna("").to_dict(orient='records')
    
    for r in records:
        if "DT_MEETING" in r and r["DT_MEETING"]:
            r["DT_MEETING"] = normalize_date_iso(r["DT_MEETING"]) or r["DT_MEETING"]
        if "NOME_SEGMENTO" in r:
            r["NOME_SEGMENTO"] = normalize_client_code(r["NOME_SEGMENTO"])
        r.setdefault("NIVEL_URGENCIA", "Não Definido")
        r.setdefault("RESPONSAVEL_REUNIAO", "")
        r.setdefault("TEM_PDF", False)
        
    output_path = 'backend/dataset_limpo.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        
    print(f"Dataset completo salvo com sucesso em {output_path}! Total: {len(records)} reuniões.")


if __name__ == '__main__':
    main()
