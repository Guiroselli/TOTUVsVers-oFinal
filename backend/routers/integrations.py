from datetime import datetime
from typing import Dict, Any, List
import requests
from fastapi import APIRouter, HTTPException

from repositories import IntegrationsRepository
from schemas import IntegracaoConfigRequest, EnviarIntegracaoRequest

router = APIRouter(prefix="/api/integracoes", tags=["Ecossistema TOTVS"])
repo = IntegrationsRepository()

SISTEMAS_TOTVS = {
    "fluig": {
        "nome": "TOTVS Fluig",
        "uso": "Automação de workflow/BPM — abre processo de aprovação",
        "portal": "https://developers.totvs.com/"
    },
    "crm": {
        "nome": "TOTVS CRM Gestão de Clientes",
        "uso": "Registra oportunidade/tarefa comercial",
        "portal": "https://developers.totvs.com/"
    },
    "protheus": {
        "nome": "TOTVS Protheus (Backoffice)",
        "uso": "Integra tarefa ao módulo Comercial/Financeiro",
        "portal": "https://api.totvs.com.br/"
    },
    "analytics": {
        "nome": "TOTVS Analytics / BI",
        "uso": "Painéis e relatórios para extrair visão de dados",
        "portal": "https://developers.totvs.com/"
    },
    "rh": {
        "nome": "TOTVS RH",
        "uso": "Gestão de capital humano e folha de pagamento",
        "portal": "https://api.totvs.com.br/"
    },
    "supply": {
        "nome": "TOTVS Supply Chain (WMS)",
        "uso": "Gestão de armazéns, estoque e logística",
        "portal": "https://api.totvs.com.br/"
    },
}


@router.get("/sistemas")
def listar_sistemas_totvs():
    config = repo.get_config()
    return {
        chave: {**info, "configurado": bool(config.get(chave, {}).get("webhook_url"))}
        for chave, info in SISTEMAS_TOTVS.items()
    }


@router.post("/config")
def salvar_config_integracao(req: IntegracaoConfigRequest):
    if req.sistema not in SISTEMAS_TOTVS:
        raise HTTPException(status_code=400, detail="Sistema TOTVS desconhecido")
    repo.save_config(req.sistema, req.webhook_url)
    return {"status": "success", "sistema": req.sistema}


@router.post("/enviar")
def enviar_integracao(req: EnviarIntegracaoRequest):
    if req.sistema not in SISTEMAS_TOTVS:
        raise HTTPException(status_code=400, detail="Sistema TOTVS desconhecido")
        
    config = repo.get_config()
    webhook_url = config.get(req.sistema, {}).get("webhook_url")
    info_sistema = SISTEMAS_TOTVS.get(req.sistema, {"nome": req.sistema, "uso": "", "portal": ""})

    registro = {
        "sistema": req.sistema,
        "sistema_nome": info_sistema["nome"],
        "meeting_id": req.meeting_id,
        "tarefas": req.tarefas,
        "data_envio": datetime.now().isoformat(),
        "status": "simulado_local",
    }

    if webhook_url:
        try:
            resp = requests.post(webhook_url, json={"meeting_id": req.meeting_id, "tarefas": req.tarefas}, timeout=10)
            registro["status"] = "enviado_real"
            registro["status_code"] = resp.status_code
        except Exception as e:
            registro["status"] = "erro_envio"
            registro["erro"] = str(e)
    else:
        registro["aviso"] = f"Sem webhook configurado. Pegue as credenciais em {info_sistema['portal']} e configure em /api/integracoes/config."

    repo.log_event(registro)
    return registro


@router.get("/historico")
def historico_integracoes():
    return repo.get_logs()
