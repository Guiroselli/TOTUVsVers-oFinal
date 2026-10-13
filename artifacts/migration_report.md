# Relatório de Migração e Saneamento do Dataset Histórico

**Data da Migração:** 13/10/2026 14:24:41  
**Dataset Alvo:** `backend/dataset_limpo.json`  
**Backup de Segurança:** `backend\dataset_limpo.backup.20261013_133641.json`  

---

## 1. Resumo Executivo da Migração

A migração sanou todas as vulnerabilidades e inconsistências identificadas na auditoria de linha de base do Proton Flow:
- **Placeholders de Anonimização Eliminados:** 4424 ocorrências (como `[PESSOA]` e `[EMPRESA]`) foram substituídas por termos corporativos neutros auditáveis.
- **Tarefas Fantasma Descartadas:** 12 tarefas sem evidência factual na transcrição foram removidas da lista oficial e arquivadas em trilha de auditoria.
- **Tarefas Factualmente Comprovadas Preservadas:** 11 tarefas com citação literal na transcrição foram preservadas com status `validated`.
- **Reuniões Curtas/Sem Conteúdo Corrigidas:** 14 reuniões com volume insuficiente (<120 caracteres ou testes conversacionais) receberam o status estrito `insufficient_data` e ata executiva condizente, sem alucinar atas completas.
- **Recomendações TOTVS Desvinculadas de Dores Removidas:** 0 sugestões sem base textual direta foram expurgadas.

---

## 2. Comparativo Antes vs Depois

| Métrica de Qualidade | Linha de Base (Antes) | Pós-Migração (Depois) | Variação |
| :--- | :---: | :---: | :---: |
| **Total de Registros** | 46 | 46 | 0 |
| **Placeholders ([PESSOA], [EMPRESA])** | 4.424 | 0 | **-100% (Saneado)** |
| **Tarefas sem Evidência Marcadas 'valid'** | 12 | 0 | **-100% (Zero Fantasmas)** |
| **Reuniões Curtas com Atas Alucinadas** | 9 | 0 | **-100% (Corrigido para insufficient_data)** |
| **Separação de Decisões vs Temas** | Inexistente (misturado) | Estrita | **Implementado** |
| **Atas Executivas Conformes Schema v1** | 20 (com alucinações) | 20 (estritamente auditadas) | **Conforme** |

---

## 3. Detalhamento das Reuniões Processadas

| # | ID da Reunião | Caracteres | Status Final | Placeholders Limpos | Tarefas Antes | Tarefas Depois | Fantasmas Removidos |
| :-: | :--- | :-: | :--- | :-: | :-: | :-: | :-: |
| 1 | `64caeabf-e92...` | 0 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 2 | `178d14dc-b21...` | 256 | `inalterado` | 0 | 0 | 0 | 0 |
| 3 | `3b29b5e2-c4c...` | 330 | `reanalise_validada` | 0 | 1 | 1 | 0 |
| 4 | `dbf06dd9-075...` | 0 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 5 | `4afb6fc4-70d...` | 0 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 6 | `bebf7dc0-fb1...` | 34 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 7 | `8d40659a-ac1...` | 34 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 8 | `6d3776e5-272...` | 34 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 9 | `0d58e0f2-958...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 10 | `30e78a7d-111...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 11 | `be53c184-07b...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 12 | `0dc23cf3-033...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 13 | `937f365a-317...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 14 | `6cee2287-6a8...` | 42 | `insufficient_data` | 0 | 1 | 0 | 1 |
| 15 | `test_decoupl...` | 41 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 16 | `85e2f617-b49...` | 114 | `insufficient_data` | 0 | 0 | 0 | 0 |
| 17 | `1247082...` | 95066 | `reanalise_validada` | 369 | 3 | 2 | 1 |
| 18 | `989351...` | 53365 | `reanalise_validada` | 259 | 5 | 4 | 1 |
| 19 | `1027294...` | 127408 | `reanalise_validada` | 532 | 1 | 0 | 1 |
| 20 | `907223...` | 32935 | `reanalise_validada` | 165 | 0 | 0 | 0 |
| 21 | `1273662...` | 54202 | `reanalise_validada` | 162 | 2 | 1 | 1 |
| 22 | `1273657...` | 54202 | `reanalise_validada` | 162 | 2 | 0 | 2 |
| 23 | `1273660...` | 54202 | `reanalise_validada` | 162 | 1 | 1 | 0 |
| 24 | `1030536...` | 7777 | `reanalise_validada` | 36 | 0 | 0 | 0 |
| 25 | `1030493...` | 13586 | `reanalise_validada` | 38 | 0 | 0 | 0 |
| 26 | `1116304...` | 21742 | `reanalise_validada` | 62 | 2 | 2 | 0 |
| 27 | `1077853...` | 27648 | `inalterado` | 82 | 0 | 0 | 0 |
| 28 | `1065886...` | 41987 | `inalterado` | 69 | 0 | 0 | 0 |
| 29 | `1367157...` | 60620 | `inalterado` | 268 | 0 | 0 | 0 |
| 30 | `1033502...` | 15631 | `inalterado` | 37 | 0 | 0 | 0 |
| 31 | `1367155...` | 60620 | `inalterado` | 268 | 0 | 0 | 0 |
| 32 | `998337...` | 34549 | `inalterado` | 107 | 0 | 0 | 0 |
| 33 | `1018805...` | 89296 | `inalterado` | 152 | 0 | 0 | 0 |
| 34 | `1018803...` | 89296 | `inalterado` | 152 | 0 | 0 | 0 |
| 35 | `1300776...` | 51962 | `inalterado` | 176 | 0 | 0 | 0 |
| 36 | `726088...` | 61794 | `inalterado` | 204 | 0 | 0 | 0 |
| 37 | `1334046...` | 21432 | `inalterado` | 65 | 0 | 0 | 0 |
| 38 | `747580...` | 15578 | `inalterado` | 57 | 0 | 0 | 0 |
| 39 | `1261450...` | 51785 | `inalterado` | 188 | 0 | 0 | 0 |
| 40 | `715850...` | 23691 | `inalterado` | 106 | 0 | 0 | 0 |
| 41 | `1192368...` | 19559 | `inalterado` | 102 | 0 | 0 | 0 |
| 42 | `1075117...` | 36084 | `inalterado` | 73 | 0 | 0 | 0 |
| 43 | `1057714...` | 50476 | `inalterado` | 90 | 0 | 0 | 0 |
| 44 | `1009326...` | 10265 | `inalterado` | 30 | 0 | 0 | 0 |
| 45 | `939460...` | 64025 | `inalterado` | 178 | 0 | 0 | 0 |
| 46 | `974451...` | 20765 | `inalterado` | 73 | 0 | 0 | 0 |

---

## 4. Garantia de Integridade e Reversibilidade

1. O arquivo original histórico foi mantido intocado no backup timestamped.
2. Nenhuma alteração irreversível foi efetuada nos modelos neurais.
3. Todas as 188 suítes de testes unitários e de integração permanecem em conformidade (100% verdes).
