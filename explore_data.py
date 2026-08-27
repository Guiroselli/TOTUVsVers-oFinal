import pandas as pd

try:
    print('=== DICIONARIO ===')
    df_dict = pd.read_excel('dicionario.xlsx')
    print(df_dict.head(15).to_string())
except Exception as e:
    print('Error reading dicionario:', e)

try:
    print('\n=== TRANSCRICAO CSV (head) ===')
    df_csv = pd.read_csv('ANON_nome_transcricao.csv', nrows=5)
    print(df_csv.head().to_string())
    print('\nColumns:', df_csv.columns.tolist())
except Exception as e:
    print('Error reading CSV:', e)
