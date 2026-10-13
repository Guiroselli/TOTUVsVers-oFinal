# Relatório de Linha de Base (Baseline) — Fase 1 RLAIF/DPO Híbrido

**Data da Auditoria:** 13/10/2026 15:56:28  
**Repositório:** `https://github.com/Guiroselli/TOTUVsVers-oFinal.git`  
**Commit Inicial Auditado:** `90bbbf438888f43a692ce20c6fe83f18cdb03447` (`main`)  
**Ponto de Restauração / Backup:** Tag `backup_before_rlaif_dpo` | Branch `backup/before-rlaif-dpo`  

---

## 1. Diagnóstico do Ambiente e Estado do Código

| Componente | Status | Detalhes |
| :--- | :---: | :--- |
| **Git Repositório** | **Limpo / Sincronizado** | Commit `90bbbf4` com tag e branch de backup criadas. |
| **`backend/dpo_reranker.py`** | **Presente** | Reranker de Fase A implementado, auditável e determinístico. |
| **Variável `DPO_ENABLED`** | **`false`** | Desabilitado por padrão no `.env.example` e `.env` (custo computacional nulo). |
| **Dataset Humano (50 Situações)** | **Presente** | 4 avaliadores independentes cobrindo 50 casos em CSV local de calibração. |
| **Planilha Sintética (500 Situações)** | **Verificada** | 2.050 avaliações de 4 IAs + 50 extras acessíveis via export Google Sheets. |
| **Formulários Originais (Alternativas A/B)** | **Presente** | 10 blocos mapeados com perguntas, trechos literais e opções de escolha. |
| **Pipeline de Atas Operacional e Executiva** | **Operacional** | Validação de evidências estrita, suficiência factual e separação de decisões. |
| **Exportações PDF/DOCX** | **Segura** | Determinística, 0 chamadas de LLM em tempo de exportação. |
| **Reuniões Simultâneas** | **Isoladas** | Controle atômico por `meeting_id` e `session_id`. |

---

## 2. Execução da Suíte de Testes e Validação Técnica

### 2.1 Backend (Pytest)
```text
python3 -m pytest backend/tests -q
........................................................................ [ 36%]
........................................................................ [ 73%]
....................................................                     [100%]
196 passed in 31.55s
```
- **Total de testes:** 196
- **Testes aprovados:** 196 (100%)
- **Falhas de código:** 0
- **Dependências ausentes:** 0

### 2.2 Frontend (Build & Lint)
- **`npm run build --prefix frontend`:** Compilação de produção com Vite concluída com sucesso em 1.65s (código de saída 0).
- **`npm run lint --prefix frontend`:** Oxlint executado em 17 arquivos com 91 regras — **0 erros, 0 avisos**.

---

## 3. Classificação de Falhas e Limitações Iniciais

- **Falhas de código:** Nenhuma (0).
- **Dependências ausentes:** Nenhuma (0).
- **Modelo STT:** faster-whisper instalado e operacional em CPU/GPU.
- **Modelo DPO / Adaptador Neural:**
  - Não há adaptador neural LoRA treinado no momento.
  - A camada DPO opera através do Reranker Híbrido Determinístico (Fase A), preservando o modelo base intacto sem risco de degradação catastrófica.
- **Falhas de ambiente:** Nenhuma.

---

## 4. Próximos Passos (Plano de Execução)

1. **Fase 2:** Ingestão segura da planilha de 2.050 avaliações (`scripts/import_preference_sheet.py`) com cópia raw versionada e SHA-256.
2. **Fase 3:** Reconstrução fidedigna das alternativas A e B e trechos de reunião para as 500 situações.
3. **Fase 4 & 5:** Normalização das escolhas e cálculo de consenso das IAs com limiar configurável ($\ge 0.75$).
4. **Fase 6:** Integração com as 50 avaliações humanas para calibração de viés e teste reservado.
5. **Fase 7 & 8:** Validação factual contra alucinações e geração dos datasets `train.jsonl`, `validation_ai.jsonl`, `test_human.jsonl`.
6. **Fase 9 & 10:** Implementação do `preference_reranker.py` híbrido e integração segura ao ciclo de reuniões ao vivo.
