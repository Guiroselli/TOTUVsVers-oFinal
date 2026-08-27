# O que foi implementado — Slides 11, 12 e 13

Testei tudo isso rodando de verdade antes de te mandar (build do React ✓,
7 testes de API com Ollama simulado ✓, dados antigos continuam funcionando ✓).

## Slide 11 — Perfil do Cliente
O campo `NOME_SEGMENTO` do seu dataset carrega o código do cliente (ex: `T27261`).
Agora, toda vez que uma reunião é sintetizada:
- O backend junta automaticamente essa reunião ao histórico daquele cliente
  (arquivo `backend/perfis_clientes.json`, criado sozinho no primeiro uso)
- Na reunião seguinte do MESMO cliente, aparece um painel azul no topo do
  resumo: quantas reuniões anteriores existem e quais dores são recorrentes
  ("Atraso / prazo em risco — 2x recorrente", etc.)
- Isso é literalmente o que o slide descreve: "a IA analisa o histórico da
  empresa para contextualizar cada conversa"

## Slide 12 — Mapeamento de Dores
Antes de mandar a transcrição pro Llama 3, um filtro por regex já caça 5
categorias de frase-gatilho (aprovação pendente, atraso, documento faltando,
gargalo operacional, insatisfação) e marca a frase exata onde aparece.
- Isso vira um "GATILHOS PRÉ-DETECTADOS" que é injetado no prompt, pra o
  modelo confirmar/organizar em vez de precisar achar sozinho
- Testei especificamente o caso do modelo "esquecer" — mesmo simulando o
  Llama 3 devolvendo `dores: []` vazio, o backend injeta os gatilhos
  pré-detectados de qualquer forma (ver função `analyze_text`)
- Na tela, cada dor aparece com uma cor por categoria e a frase entre aspas
  que originou o alerta — igual ao "GATILHOS DETECTADOS PELA IA" do slide

## Slide 13 — Ecossistema TOTVS
Pesquisei os produtos reais da TOTVS antes de implementar:
- **TOTVS Fluig** — plataforma de BPM/workflow (não é ERP, mas se integra a ele)
- **TOTVS CRM Gestão de Clientes** — produto de CRM com suíte de APIs própria
- **TOTVS Protheus (Backoffice)** — ERP com módulo Comercial/Financeiro

Adicionei 3 botões no Plano de Ação de cada reunião ("Enviar para TOTVS Fluig",
"...CRM Gestão de Clientes", "...Protheus"). **Sendo honesto**: sem credenciais
reais de API, isso grava a intenção de envio localmente (modo simulado) — não
tem como fingir uma integração de verdade sem acesso que só a TOTVS libera.

Quando vocês tiverem as credenciais, é só ir em **Ecossistema TOTVS** (novo
botão no menu lateral) e colar a URL do webhook/API de cada sistema. As
credenciais reais se pegam em:
- https://developers.totvs.com/ (portal geral)
- https://api.totvs.com.br/ (TOTVS API Reference, specs OpenAPI)

## Compatibilidade
Suas 30 reuniões já processadas continuam funcionando normalmente — eu testei
isso especificamente. Elas têm "dores" no formato antigo (texto simples) e o
frontend detecta e mostra do jeito antigo. Só as reuniões que você sintetizar
DE AGORA EM DIANTE vão ganhar a categorização nova.

## Como rodar
Igual sempre (nada mudou na forma de iniciar):
```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
```
cd frontend
npm install
npm run dev
```

Nenhuma dependência nova foi adicionada — o `requirements.txt` e o
`package.json` continuam exatamente iguais.
