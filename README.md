# Proton Flow 🚀 — Plataforma de Inteligência Gerencial e Atas Corporativas TOTVS

O **Proton Flow** é uma solução corporativa avançada de inteligência gerencial, transcrição e síntese de reuniões empresariais. A plataforma transforma conversas de reuniões (ao vivo ou históricas) em indicadores agregados trimestrais, planos de ação automatizados, mapeamento de dores canônicas e conexões com o ecossistema de produtos TOTVS.

---

## 🌟 Principais Módulos e Funcionalidades

### 1. 📊 Visão Trimestral & Inteligência Gerencial (Analytics)
- **Seleção Dinâmica de Período**: Seleção rápida de trimestres prontos (1º, 2º, 3º ou 4º Tri de qualquer ano) ou intervalos de datas customizados.
- **Filtros Avançados**: Segmentação por código de cliente, formato da reunião (Vídeo, Presencial, Voz) e status.
- **Métricas Executivas Agregadas**:
  - Total de reuniões, reuniões analisadas e reuniões pendentes de análise.
  - **Ranking de Temas Mais Discutidos**: Cálculo de contagem única por reunião (`reunioes_com_tema`), volume de ocorrências e percentual sobre a base, calculado pelo backend.
  - **Dores & Gargalos Recorrentes**: Agrupamento por categorias canônicas (`aprovacao_pendente`, `atraso_prazo`, `gargalo_operacional`, `insatisfacao_cliente`, etc.) com severidade e percentual de reuniões impactadas.
  - **Plano de Ação Corporativo**: Identificação de ações abertas vs ações vencidas.
  - **Clientes em Risco**: Identificação de contas com maior concentração de problemas e tarefas pendentes.
  - **Distribuição de Urgência**: Gráfico com distribuição entre Baixa, Média, Alta e Crítica.
  - **Série Temporal**: Evolução de reuniões, dores e tarefas por mês.
  - **NPS Médio**: Indicador de satisfação com distribuição entre promotores, neutros e detratores.
- **Navegação Drill-Down**: Clique em qualquer tema, dor ou indicador para abrir o modal de evidências textuais com as reuniões de origem e trechos da transcrição.

### 2. 🤖 Preenchimento Automático de Metadados com IA
- **Extração com Confiança e Evidência**: Sugestão de Facilitador/Responsável Geral, Nível de Urgência, Tema Principal, Tarefas com Prazos e Evidência Textual citada.
- **Painel de Validação Humana**: O usuário pode **Confirmar**, **Editar** ou **Rejeitar** cada sugestão gerada pela IA, prevalecendo a decisão do usuário sobre o registro final.
- **Regras Determinísticas de Segurança**:
  - Detecção de termos críticos (*bloqueado*, *prazo vencido*, *produção parada*, *risco de perder o cliente*) com elevação automática da urgência para **Alta** ou **Crítica**.
  - Responsável geral não citado na conversa é registrado como `"Não identificado"` com confiança zero.
  - Prazos não mencionados explicitamente são marcados como `"Não mencionado"`, sem invenção de datas pelo LLM.
  - Validação estrita de schema com Pydantic antes de qualquer gravação.

### 3. 🎯 Normalização Canônica
- Módulo de normalização com suporte a sinônimos, aliases e correções ortográficas/acentuadas (ex: `aprovacao_pendente`, `garagalo_operacional`, `document_faltando`).
- Normalização de datas para padrão **ISO 8601** (`YYYY-MM-DD` ou `YYYY-MM-DD HH:MM:SS`).
- Preservação da compatibilidade integral com reuniões legadas (com `dores` em texto puro ou objetos).

### 4. 🔗 Ecossistema TOTVS
- **TOTVS Fluig**: Automação de workflow/BPM e aprovações.
- **TOTVS CRM Gestão de Clientes**: Oportunidades comerciais e retenção.
- **TOTVS Protheus (Backoffice)**: Gestão comercial, financeira e suprimentos.
- **TOTVS Analytics / BI**, **TOTVS RH** e **TOTVS Supply Chain (WMS)**.
- Disparo de tarefas com registro de log e modo simulado local seguro (sem exigir credenciais fixas no código).

### 5. 📄 Exportadores Otimizados (PDF & DOCX)
- Exportação de atas executivas em **PDF** (com armazenamento no servidor) e **DOCX**.
- Reutilização da análise já persistida, eliminando re-execuções desnecessárias da IA ao exportar.

### 6. 🎙️ Transcrição Ao Vivo
- Reconhecimento de fala integrado ao navegador (Web Speech API) e suporte a streaming com **Faster-Whisper** via WebSocket.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, Vite 8, JavaScript moderno, Recharts, jsPDF, docx, file-saver.
- **Backend**: Python 3.10+, FastAPI, Pydantic v2, Uvicorn, Requests, Faster-Whisper, Pytest.
- **IA / LLM**: Ollama local com modelo configurável (preferencialmente `llama3`).
- **Persistência**: Camada Repository thread-safe com escritas atômicas e rastreabilidade de auditoria.

---

## ⚙️ Variáveis de Ambiente

Crie ou configure as variáveis de ambiente no arquivo `.env` ou nas variáveis do sistema:

```env
# Backend (FastAPI / Ollama)
OLLAMA_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT_SECONDS=180
ANALYSIS_PROMPT_VERSION=v2
CORS_ORIGINS=*

# Frontend (Vite)
VITE_API_URL=http://localhost:8000
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
1. [Node.js](https://nodejs.org/) (v20.19+ ou v22+)
2. [Python](https://www.python.org/) 3.10+
3. [Ollama](https://ollama.com/) instalado com o modelo Llama 3 (`ollama run llama3`).

---

### 1. Inicializando o Backend (FastAPI)

Abra um terminal na pasta do projeto:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

O servidor estará disponível em `http://localhost:8000`. Documentação OpenAPI interativa em `http://localhost:8000/docs`.

---

### 2. Inicializando o Frontend (React + Vite)

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Acesse a interface no navegador em `http://localhost:5173`.

---

## 🧪 Executando os Testes Automatizados

O projeto conta com uma suíte de testes cobrindo normalização, regras determinísticas, agregações trimestrais, compatibilidade retroativa, concorrência e endpoints da API.

Para rodar todos os testes:

```bash
python -m pytest backend/tests -v
```

Para validar a integridade do Frontend:

```bash
cd frontend
npm run lint
npm run build
```

---

## 📂 Estrutura do Projeto

```
├── backend/
│   ├── main.py                  # Ponto de entrada FastAPI, middlewares e WebSocket
│   ├── schemas.py               # Modelos de dados Pydantic
│   ├── normalization.py         # Normalizador de categorias, temas, datas ISO e códigos
│   ├── repositories.py          # Camada Repository thread-safe com escrita atômica
│   ├── analysis_service.py      # Serviço de integração Ollama e regras de segurança
│   ├── analytics_service.py     # Agregações trimestrais, séries temporais e drill-down
│   ├── routers/
│   │   ├── analytics.py         # Endpoints de Visão Trimestral e Drilldown
│   │   ├── meetings.py          # Endpoints de Reuniões, Metadados e Sugestões
│   │   └── integrations.py      # Endpoints do Ecossistema TOTVS
│   ├── tests/                   # Suíte de testes unitários e de integração
│   ├── dataset_limpo.json       # Base de reuniões e sínteses
│   └── perfis_clientes.json     # Histórico consolidado por cliente
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js        # Cliente HTTP centralizado
│   │   ├── components/
│   │   │   ├── Sidebar.jsx              # Barra lateral de navegação
│   │   │   ├── QuarterlyAnalyticsPage.jsx # Dashboard de inteligência trimestral
│   │   │   ├── EvidenceModal.jsx        # Modal de evidências e drill-down
│   │   │   ├── MeetingHistoryTable.jsx  # Tabela paginada de histórico
│   │   │   ├── MeetingDetail.jsx        # Detalhes e síntese da reunião
│   │   │   ├── MeetingFieldSuggestions.jsx # Painel de validação de sugestões IA
│   │   │   ├── ActionPlanTable.jsx      # Plano de ação e status de tarefas
│   │   │   ├── LiveMeetingPage.jsx      # Sala de reunião ao vivo
│   │   │   └── TotvsIntegrationModal.jsx # Configuração de webhooks TOTVS
│   │   └── App.jsx              # Ponto de entrada React com rotas de tela
├── reparse_meetings.py          # Parser para importação de todas as reuniões sem limite
├── clean_dataset.py             # Limpeza e normalização do dataset
└── README.md                    # Documentação do projeto
```

---

## 🔒 Segurança e Tratamento de Dados Corporativos

- **Processamento de Dados Corporativos**: Esta aplicação processa transcrições de reuniões estratégicas. Recomenda-se executar o Ollama localmente na infraestrutura da organização.
- **Sem Credenciais em Código**: Nenhuma chave ou webhook sensível é versionado.
- **Validação de Uploads**: Uploads de arquivos PDF possuem validação estrita de extensão e limite máximo de 30MB.
- **Trilha de Auditoria**: Alterações manuais e confirmações de sugestões da IA são registradas no arquivo de auditoria `backend/audit_events.json`.

---

## 🤝 Contribuidores

- Antonio Jr
- Lucas Miranda
- Guilherme Roselli
