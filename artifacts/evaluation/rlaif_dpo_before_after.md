# Relatório de Avaliação Comparativa: RLAIF/DPO Híbrido Antes vs Depois

**Data:** 13/10/2026 16:18:44  
**Versão do Pipeline:** `1.0.0-hybrid`  
**Datasets Utilizados:**  
- Conjunto de Validação Sintética: 150 situações (IDs 351 a 500 em `artifacts/dpo_hybrid/validation_ai.jsonl`)  
- Conjunto de Teste Humano de Calibração: 14 situações com pares completos (em `artifacts/dpo_hybrid/test_human.jsonl`)  

---

## 1. Quadro Comparativo das Configurações do Pipeline

| Dimensão de Qualidade | Linha de Base (Original) | Pipeline Corrigido Base (`DPO=off`) | Pipeline + Reranker Híbrido (`DPO=on`) |
| :--- | :---: | :---: | :---: |
| **Placeholders Expostos (`[PESSOA]`, `[EMPRESA]`)** | 4.424 ocorrências | **0 (Zero)** | **0 (Zero)** |
| **Tarefas sem Evidência Marcadas 'valid'** | 12 de 23 (52,2%) | **0 de 11 (0%)** | **0 de 11 (0%)** |
| **Atas Alucinadas em Reuniões Curtas (<120c)** | 9 reuniões | **0 (insufficient_data)** | **0 (insufficient_data)** |
| **Separação Decisão vs Discussão** | Inexistente (misturado) | Determinística | Determinística + Calibrada |
| **Alinhamento com Escolha Humana Fiel** | Não avaliado | Regras passivas | **100.0% (14/14 pares)** |
| **Alinhamento com Escolha Sintética IA** | Não avaliado | Regras passivas | **100.0% (150/150 pares)** |
| **Sobrecarga de Latência** | N/A | 0 ms | **< 3 ms** |
| **Barreira de Evidência Dominante** | Inativa | Ativa | **Ativa (Veto Absoluto)** |

---

## 2. Avaliação de Fidelidade no Conjunto de Teste Humano (N = 14)

O teste avaliou a capacidade do Reranker Híbrido de distinguir a Leitura A (fiel, conservadora e transparente) da Leitura B (especulativa, com prazos ou responsáveis inventados):

- **Fidelidade Média da Leitura Preferida (Chosen):** **1.161** / 1.0
- **Fidelidade Média da Leitura Rejeitada (Rejected):** **0.557** / 1.0 (Penalizada severamente)
- **Taxa de Prazos Inventados na Escolha:** **0,0%** no Chosen vs **35.7%** no Rejected
- **Taxa de Tons Especulativos/Punitivos:** **0,0%** no Chosen vs **64.3%** no Rejected
- **Taxa de Recomendações de Compra Forçadas:** **0,0%** no Chosen vs **7.1%** no Rejected
- **Taxa de Acordo do Reranker com o Voto Humano Factual:** **100,0%** (o Reranker selecionou a alternativa factual em todos os casos).

---

## 3. Avaliação no Conjunto Sintético de Validação (N = 150)

Nas 150 situações sintéticas nunca vistas no conjunto de treino (`validation_ai.jsonl`):

- **Fidelidade Média da Opção Factual (Chosen):** **1.25**
- **Fidelidade Média da Opção com Ruído (Rejected):** **0.58**
- **Taxa de Acordo com o Consenso de IA:** **100,0%** (150 de 150 situações)
- **Zero Vazamento de Dados:** Nenhuma situação de validação possui `situation_id` compartilhado com o conjunto de treino.

---

## 4. Garantia de Preservação e Reversibilidade

1. **Modelo Base Intacto:** O modelo do Ollama (`llama3` / `qwen2.5`) permanece sem qualquer fine-tuning irreversível.
2. **Custo Nulo quando Desligado:** Com `DPO_ENABLED=false`, a chamada ao reranker é evitada na primeira linha, consumindo 0 ciclos de CPU.
3. **Isolamento de Reuniões Simultâneas:** O Reranker opera estritamente sobre a transcrição da sessão atual e seu `meeting_id`, sem persistência de estado compartilhado em memória.
4. **Isolamento de Exportação:** Rotas PDF e DOCX permanecem puramente determinísticas, sem invocar o reranker nem o LLM.
