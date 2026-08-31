import hashlib
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import requests
from fastapi import APIRouter, HTTPException

from repositories import IntegrationsRepository, MeetingRepository
from schemas import IntegracaoConfigRequest, EnviarIntegracaoRequest, IdempotentIntegrationReceipt
from totvs_catalog import CATALOGO_TOTVS

router = APIRouter(prefix="/api/integracoes", tags=["Ecossistema TOTVS"])
repo = IntegrationsRepository()
meeting_repo = MeetingRepository()

SISTEMAS_TOTVS = {
    "fluig": {
        "nome": "TOTVS Fluig",
        "area": "Workflow, BPM e ECM",
        "uso": "Automação de fluxos formais de aprovação, controle de documentos e SLA",
        "portal": "https://developers.totvs.com/"
    },
    "crm": {
        "nome": "TOTVS CRM Gestão de Clientes",
        "area": "Gestão Comercial e Relacionamento",
        "uso": "Registro de oportunidades, tarefas comerciais e histórico 360° do cliente",
        "portal": "https://developers.totvs.com/"
    },
    "protheus": {
        "nome": "TOTVS Protheus (ERP)",
        "area": "ERP Backoffice e Gestão Integrada",
        "uso": "Integração a módulos Financeiro, Faturamento, Compras e PCP",
        "portal": "https://api.totvs.com.br/"
    },
    "analytics": {
        "nome": "TOTVS Analytics / BI",
        "area": "BI e Dashboards",
        "uso": "Consolidação de métricas corporativas, KPIs e evolução temporal",
        "portal": "https://developers.totvs.com/"
    },
    "rh": {
        "nome": "TOTVS RH",
        "area": "Gestão de Pessoas",
        "uso": "Gestão de colaboradores, escalas, jornada e recrutamento",
        "portal": "https://api.totvs.com.br/"
    },
    "supply": {
        "nome": "TOTVS Supply Chain (WMS)",
        "area": "Cadeia de Suprimentos",
        "uso": "Gestão de armazéns, estoque, inventário e logística",
        "portal": "https://api.totvs.com.br/"
    },
}


def compute_request_hash(meeting_id: str, sistema: str, tarefas: List[Dict[str, Any]]) -> str:
    """Gera hash SHA-256 determinístico para idempotência de envio."""
    tarefas_serializadas = sorted([
        f"{t.get('tarefa', '')}_{t.get('responsavel', '')}_{t.get('prazo', '')}"
        for t in tarefas if isinstance(t, dict)
    ])
    payload_str = f"{meeting_id}|{sistema}|{'||'.join(tarefas_serializadas)}"
    return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()


def mask_webhook_url(url: str) -> str:
    if not url or len(url) < 8:
        return ""
    if "://" in url:
        scheme, rest = url.split("://", 1)
        if "/" in rest:
            host, path = rest.split("/", 1)
            return f"{scheme}://{host}/••••••••"
        return f"{scheme}://{rest[:4]}••••"
    return "••••••••"


@router.get("/sistemas")
def listar_sistemas_totvs():
    config = repo.get_config()
    return {
        chave: {
            **info,
            "product_key": chave,
            "configurado": bool(config.get(chave, {}).get("webhook_url")),
            "webhook_url": mask_webhook_url(config.get(chave, {}).get("webhook_url", ""))
        }
        for chave, info in SISTEMAS_TOTVS.items()
    }


@router.post("/config")
def salvar_config_integracao(req: IntegracaoConfigRequest):
    if req.sistema not in SISTEMAS_TOTVS:
        raise HTTPException(status_code=400, detail="Sistema TOTVS desconhecido.")
    repo.save_config(req.sistema, req.webhook_url)
    return {"status": "success", "sistema": req.sistema, "message": f"Webhook do {SISTEMAS_TOTVS[req.sistema]['nome']} configurado."}


@router.delete("/config/{sistema}")
def remover_config_integracao(sistema: str):
    if sistema not in SISTEMAS_TOTVS:
        raise HTTPException(status_code=400, detail="Sistema TOTVS desconhecido.")
    repo.delete_config(sistema)
    return {"status": "success", "sistema": sistema, "message": f"Configuração do {SISTEMAS_TOTVS[sistema]['nome']} removida."}


@router.post("/enviar", response_model=IdempotentIntegrationReceipt)
def enviar_integracao(req: EnviarIntegracaoRequest):
    if req.sistema not in SISTEMAS_TOTVS:
        raise HTTPException(status_code=400, detail="Sistema TOTVS desconhecido.")

    # 1. Validação de Bloqueio: A recomendação deve estar confirmada
    meeting = meeting_repo.get_by_id(req.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunião não encontrada.")

    resumo = meeting.get("RESUMO_IA")
    recs = meeting.get("recomendacoes_totvs") or (resumo.get("recomendacoes_totvs") if isinstance(resumo, dict) else [])
    
    rec_alvo = None
    for r in recs or []:
        if isinstance(r, dict) and r.get("product_key") == req.sistema:
            rec_alvo = r
            break

    # Se houver recomendação, exige confirmação (a menos que seja envio simulado explícito para testes)
    if rec_alvo and rec_alvo.get("review_status") != "confirmed" and not req.modo_simulado:
        raise HTTPException(
            status_code=400, 
            detail=f"Envio bloqueado: A recomendação do {SISTEMAS_TOTVS[req.sistema]['nome']} precisa ser confirmada antes do envio real."
        )

    # 2. Idempotência via request_hash
    req_hash = compute_request_hash(req.meeting_id, req.sistema, req.tarefas)
    existing_receipt = repo.get_by_request_hash(req_hash)
    if existing_receipt and existing_receipt.get("status") in ["enviado_real", "simulado"]:
        # Retorna o recibo idempotente existente sem duplicar envio
        return IdempotentIntegrationReceipt(
            request_hash=req_hash,
            meeting_id=req.meeting_id,
            sistema=req.sistema,
            status=existing_receipt["status"],
            attempt_count=existing_receipt.get("attempt_count", 1),
            last_attempt_at=existing_receipt.get("last_attempt_at", datetime.now().isoformat()),
            tarefas_count=len(req.tarefas),
            mensagem_usuario=f"Requisição já processada anteriormente (idempotente). {existing_receipt.get('mensagem_usuario', '')}",
            simulado=existing_receipt.get("simulado", True),
            response_summary=existing_receipt.get("response_summary")
        )

    config = repo.get_config()
    webhook_url = config.get(req.sistema, {}).get("webhook_url")
    info_sistema = SISTEMAS_TOTVS.get(req.sistema, {"nome": req.sistema})
    is_simulado = bool(req.modo_simulado or not webhook_url)

    attempt_count = (existing_receipt.get("attempt_count", 0) + 1) if existing_receipt else 1
    now_iso = datetime.now().isoformat()

    receipt_dict = {
        "request_hash": req_hash,
        "meeting_id": req.meeting_id,
        "sistema": req.sistema,
        "sistema_nome": info_sistema["nome"],
        "tarefas": req.tarefas,
        "tarefas_count": len(req.tarefas),
        "attempt_count": attempt_count,
        "last_attempt_at": now_iso,
        "simulado": is_simulado,
        "status": "simulado" if is_simulado else "pendente",
        "mensagem_usuario": "Simulação local — nenhuma informação foi enviada à TOTVS.",
        "response_summary": None
    }

    if webhook_url and not req.modo_simulado:
        # Envio real com retry apenas para erros transitórios (5xx ou connection timeout)
        max_retries = 2
        for attempt in range(max_retries):
            try:
                resp = requests.post(
                    webhook_url, 
                    json={
                        "meeting_id": req.meeting_id,
                        "request_hash": req_hash,
                        "tarefas": req.tarefas,
                        "cliente": meeting.get("NOME_SEGMENTO")
                    }, 
                    timeout=8
                )
                if resp.status_code < 500:
                    # Resposta definitiva (2xx ou 4xx)
                    receipt_dict["status"] = "enviado_real" if resp.status_code < 300 else "falha"
                    receipt_dict["response_summary"] = {"status_code": resp.status_code, "body": resp.text[:200]}
                    receipt_dict["mensagem_usuario"] = (
                        f"Tarefas enviadas com sucesso ao webhook do {info_sistema['nome']} (Status {resp.status_code})."
                        if resp.status_code < 300 else
                        f"Erro de validação retornado pelo endpoint do {info_sistema['nome']} (Status {resp.status_code})."
                    )
                    break
            except requests.exceptions.RequestException as e:
                if attempt == max_retries - 1:
                    receipt_dict["status"] = "falha"
                    receipt_dict["response_summary"] = {"error": str(e)[:200]}
                    receipt_dict["mensagem_usuario"] = f"Falha de conexão com o endpoint do {info_sistema['nome']} após retentativas."
    else:
        receipt_dict["status"] = "simulado"
        receipt_dict["mensagem_usuario"] = "Simulação local — nenhuma informação foi enviada à TOTVS."

    repo.record_idempotent_event(receipt_dict)

    return IdempotentIntegrationReceipt(
        request_hash=req_hash,
        meeting_id=req.meeting_id,
        sistema=req.sistema,
        status=receipt_dict["status"],
        attempt_count=attempt_count,
        last_attempt_at=now_iso,
        tarefas_count=len(req.tarefas),
        mensagem_usuario=receipt_dict["mensagem_usuario"],
        simulado=is_simulado,
        response_summary=receipt_dict.get("response_summary")
    )


@router.get("/historico")
def historico_integracoes():
    return repo.get_logs()
