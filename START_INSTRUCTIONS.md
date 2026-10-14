# Proton Flow — Instruções de Execução

## Execução correta do Proton Flow

### 1. Primeira instalação
Instale as dependências do backend e do frontend e execute o script de provisionamento idempotente do STT:

```bash
# 1.1 Dependências do Backend
python -m venv venv
.\venv\Scripts\activate   # No Windows (ou source venv/bin/activate no Linux/macOS)
pip install -r backend/requirements.txt

# 1.2 Dependências do Frontend
cd frontend
npm install
cd ..

# 1.3 Configuração e download do modelo STT no cache canônico
python scripts/setup_stt.py

# 1.4 (Opcional) Diagnóstico de prontidão do ambiente
python scripts/check_stt_environment.py
```

---

### 2. Iniciar o Backend
O backend suporta inicialização a partir da raiz ou a partir da pasta `backend`:

#### Opção A: A partir da raiz do repositório (Recomendado)
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

#### Opção B: A partir da pasta backend
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

#### Opção C: Script unificado de desenvolvimento
```bash
python scripts/start_dev.py
```

---

### 3. Iniciar o Frontend
Em outro terminal:

```bash
cd frontend
npm run dev
```

O frontend estará disponível em `http://localhost:5173`.

---

### 3.1. Subir o Túnel Cloudflare (Domínio Oficial: protonflow.com.br)
Para disponibilizar o sistema publicamente através do Cloudflare Tunnel configurado para o domínio oficial:

```bash
# Opção A: Usando os scripts de inicialização (com o token do domínio configurado)
.\scripts\start_tunnel.bat   # Windows CMD / Duplo clique
# ou
powershell -File .\scripts\start_tunnel.ps1

# Opção B: Usando o comando com token diretamente
cloudflared tunnel run --token <SEU_TOKEN>
```

O túnel direciona o tráfego de `https://protonflow.com.br` diretamente para o backend na porta 8000, que serve tanto a API FastAPI quanto o frontend compilado em `frontend/dist`.

---

### 4. Verificação do Endpoint STT
Valide se o faster-whisper e o cache canônico estão operacionais acessando:

- **Endpoint**: `GET http://127.0.0.1:8000/api/stt/status`
- **Exemplo de Payload Esperado (PC de Hospedagem com RTX 3060 e CUDA)**:
```json
{
  "enabled": true,
  "available": true,
  "ready": true,
  "provider": "faster_whisper",
  "engine": "faster-whisper",
  "model_size": "medium",
  "device": "cuda",
  "compute_type": "float16",
  "hardware_profile": "nvidia_compatible",
  "model_state": "model_loaded",
  "cache_dir": "<raiz-do-projeto>\\models",
  "model_cached": true,
  "fallback_occurred": false,
  "fallback_reason": null,
  "unavailable_reason": null,
  "error_detail": null
}
```
*(Em máquinas sem GPU dedicada ou em modo CPU, `device="cpu"`, `model_size="small"` e `compute_type="int8"` são adotados automaticamente com `hardware_profile="cpu_balanced"`).*

---

### 5. Erros comuns e como resolver

1. **`Fallback Backend STT: faster-whisper indisponível (model_load_error)`**:
   - **Causa**: Pesos do modelo ausentes na pasta canônica `models/` ou tentativa de download dinâmico durante processamento de áudio sem conexão externa.
   - **Solução**: Execute `python scripts/setup_stt.py`. O script baixa os arquivos necessários uma única vez em `<raiz-do-projeto>/models` com verificação de integridade.

2. **`PyAV incompatível (av >= 19)`**:
   - **Causa**: A versão 19+ do PyAV possui quebra de API com o faster-whisper.
   - **Solução**: Instale uma versão compatível:
     ```bash
     pip install "av<19"
     ```

3. **`Porta 8000 ocupada`**:
   - **Causa**: Uma instância anterior do Uvicorn ou outro serviço está ocupando a porta.
   - **Solução**:
     - No Windows PowerShell:
       ```powershell
       Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
       ```
     - No Linux/macOS:
       ```bash
       lsof -ti:8000 | xargs kill -9
       ```

4. **`Dependências ausentes (faster-whisper, ctranslate2)`**:
   - **Solução**: Ative o ambiente virtual e execute `pip install -r backend/requirements.txt`.
