import os
import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, Depends

from repositories import MeetingRepository, ProfileRepository, IntegrationsRepository, PDF_DIR, pdf_path_for
from schemas import (
    PaginatedMeetingsResponse, 
    MeetingSchema, 
    SuggestionActionRequest, 
    RecommendationActionRequest,
    MetadataUpdateRequest,
    SaveMeetingRequest,
    UrgencyRequest,
    ResponsibleRequest,
    TaskStatusRequest,
    ExecutiveSummarySchema,
    GenerateExecutiveSummaryRequest,
    ExecutiveStatusUpdateRequest
)
from normalization import normalize_client_code, normalize_urgency
from analysis_service import AnalysisService

router = APIRouter(prefix="/api", tags=["Meetings"])
repo = MeetingRepository()
profile_repo = ProfileRepository()
integrations_repo = IntegrationsRepository()
analysis_service = AnalysisService()


@router.get("/meetings", response_model=PaginatedMeetingsResponse)
def list_meetings(
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(10, ge=1, le=100, description="Itens por página"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    client_code: Optional[str] = Query(None),
    segment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    only_unanalyzed: bool = Query(False),
    search: Optional[str] = Query(None)
):
    """
    Lista reuniões com paginação, filtros sob demanda e busca textual no backend.
    """
    items, total, total_pages = repo.get_paginated(
        page=page,
        page_size=page_size,
        start_date=start_date,
        end_date=end_date,
        client_code=client_code,
        segment_filter=segment,
        status_filter=status,
        format_filter=format,
        only_unanalyzed=only_unanalyzed,
        search=search
    )
    return PaginatedMeetingsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    meeting = repo.get_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return meeting


@router.get("/meetings/{meeting_id}/suggestions")
def get_meeting_suggestions(meeting_id: str):
    suggestions = repo.get_suggestions(meeting_id)
    return {"meeting_id": meeting_id, "suggestions": suggestions}


@router.post("/meetings/{meeting_id}/suggestions/{field_name}/confirm")
def handle_suggestion_action(
    meeting_id: str,
    field_name: str,
    req: SuggestionActionRequest
):
    """
    Permite ao usuário confirmar, editar ou rejeitar cada sugestão da IA.
    O valor confirmado pelo usuário prevalece sobre a sugestão automática.
    """
    if req.action not in ["confirm", "edit", "reject"]:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'confirm', 'edit' ou 'reject'.")

    result = repo.update_suggestion(
        meeting_id=meeting_id,
        field_name=field_name,
        action=req.action,
        custom_value=req.value,
        author="user"
    )
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Reunião ou sugestão de campo não encontrada.")
    return result


@router.get("/meetings/{meeting_id}/recommendations")
def get_meeting_recommendations(meeting_id: str):
    """
    Retorna recomendações detalhadas de produtos TOTVS para a reunião com fit score,
    evidências da transcrição, capacidades e status de revisão.
    """
    cfg = integrations_repo.get_config()
    recs = repo.get_recommendations(meeting_id, integrations_config=cfg)
    return {"meeting_id": meeting_id, "recommendations": recs}


@router.post("/meetings/{meeting_id}/recommendations/{product_key}/confirm")
def handle_recommendation_action(
    meeting_id: str,
    product_key: str,
    req: RecommendationActionRequest
):
    """
    Permite ao usuário confirmar ou rejeitar uma recomendação de produto TOTVS.
    """
    if req.action not in ["confirm", "reject"]:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'confirm' ou 'reject'.")

    result = repo.update_recommendation_status(
        meeting_id=meeting_id,
        product_key=product_key,
        action=req.action,
        author="user"
    )
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Reunião ou recomendação não encontrada.")
    return result


@router.post("/meetings/{meeting_id}/analyze")
def analyze_existing_meeting(meeting_id: str):
    """
    Executa a análise de IA desacoplada para uma reunião existente e persiste o resultado.
    """
    meeting = repo.get_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")

    transcript = meeting.get("ANON_TRANSCRICAO", "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Esta reunião não possui transcrição para ser analisada.")

    client_code = meeting.get("NOME_SEGMENTO", "Geral")
    profile = profile_repo.get_profile(client_code) if client_code else None
    cfg = integrations_repo.get_config()

    # Atualiza status para analise_em_andamento
    repo.update_metadata(meeting_id, {"STATUS_MEETING": "analise_em_andamento"}, author="system")

    try:
        analysis_result = analysis_service.analyze(
            transcript=transcript,
            client_context=f"Contexto do cliente {client_code}",
            meeting_date_str=meeting.get("DT_MEETING"),
            perfil_cliente=profile,
            integracoes_config=cfg
        )
        dict_result = analysis_result.model_dump()
        meta = dict_result.get("analise_metadados") or {}
        canon_status = meta.get("analysis_status") or "analise_concluida"
        repo.update_analysis(meeting_id, dict_result)
        repo.update_metadata(meeting_id, {"STATUS_MEETING": canon_status, "STATUS_ANALISE": canon_status}, author="system")
        return {"status": "success", "meeting_id": meeting_id, "analysis": dict_result}
    except Exception as e:
        repo.update_metadata(meeting_id, {"STATUS_MEETING": "analise_com_erro", "STATUS_ANALISE": "analise_com_erro"}, author="system")
        raise HTTPException(status_code=500, detail=f"Erro ao processar análise da reunião: {str(e)}")


@router.get("/meetings/{meeting_id}/executive-summary")
def get_meeting_executive_summary(meeting_id: str):
    """
    Retorna a Ata Executiva oficial persistida da reunião.
    Se não existir mas a reunião tiver análise estruturada, gera e persiste deterministicamente.
    """
    meeting = repo.get_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")

    resumo_ia = meeting.get("RESUMO_IA")
    if not resumo_ia or not isinstance(resumo_ia, dict):
        return {
            "status": "not_generated",
            "message": "Esta reunião ainda não possui análise estruturada. Execute a análise antes de obter a ata executiva.",
            "meeting_id": meeting_id,
            "executive_summary": None
        }

    exec_summary = repo.get_executive_summary(meeting_id)
    return {
        "status": "success",
        "meeting_id": meeting_id,
        "executive_summary": exec_summary
    }


@router.post("/meetings/{meeting_id}/executive-summary/generate")
def generate_meeting_executive_summary(
    meeting_id: str,
    req: Optional[GenerateExecutiveSummaryRequest] = None
):
    """
    Gera ou regenera a Ata Executiva da reunião a partir dos dados já persistidos.
    Operação explícita, idempotente e auditada.
    """
    meeting = repo.get_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")

    resumo_ia = meeting.get("RESUMO_IA")
    if not resumo_ia or not isinstance(resumo_ia, dict):
        raise HTTPException(status_code=400, detail="Esta reunião precisa ser analisada antes de gerar a ata executiva.")

    force = req.force_regenerate if req else False
    use_llm = req.use_llm if req else False

    existing_exec = meeting.get("RESUMO_EXECUTIVO")
    if existing_exec and not force:
        return {
            "status": "success",
            "message": "Ata executiva persistida recuperada com sucesso.",
            "meeting_id": meeting_id,
            "executive_summary": existing_exec
        }

    exec_summary = analysis_service.build_executive_summary(
        analysis_data=resumo_ia,
        meeting_metadata={
            "meeting_id": str(meeting_id),
            "client_code": meeting.get("NOME_SEGMENTO"),
            "segment": meeting.get("segment"),
            "meeting_date": meeting.get("DT_MEETING")
        },
        use_llm=use_llm
    )
    repo.save_executive_summary(meeting_id, exec_summary, author="user")

    return {
        "status": "success",
        "message": "Ata executiva gerada e persistida com sucesso.",
        "meeting_id": meeting_id,
        "executive_summary": exec_summary
    }


@router.patch("/meetings/{meeting_id}/executive-summary/status")
def update_meeting_executive_status(
    meeting_id: str,
    req: ExecutiveStatusUpdateRequest
):
    """
    Atualiza o status de revisão humana da Ata Executiva ('pending_review' | 'reviewed' | 'approved').
    """
    target_status = req.effective_status
    if target_status not in ["pending_review", "reviewed", "approved"]:
        raise HTTPException(status_code=400, detail="Status inválido. Use 'pending_review', 'reviewed' ou 'approved'.")

    updated = repo.update_executive_summary_status(meeting_id, target_status, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Reunião ou ata executiva não encontrada.")

    return {
        "status": "success",
        "message": f"Status da ata executiva atualizado para '{target_status}' com sucesso.",
        "meeting_id": meeting_id,
        "review_status": target_status
    }


@router.post("/meetings/reset_analyses")
def reset_all_meetings_analyses():
    """
    Reseta todas as reuniões para o estado não analisado ('aguardando_analise'),
    permitindo reanalisar todas as atas via IA.
    """
    count = repo.reset_all_analyses()
    return {"status": "success", "message": f"{count} reuniões foram resetadas para nova análise.", "count": count}


@router.get("/tasks/recurring")
def get_recurring_tasks():
    """
    Retorna tarefas duplicadas e recorrentes identificadas entre diferentes reuniões.
    """
    groups = repo.find_duplicate_and_recurring_tasks()
    return {"total_groups": len(groups), "duplicate_groups": groups}


@router.patch("/meetings/{meeting_id}/metadata")
def update_meeting_metadata(meeting_id: str, req: MetadataUpdateRequest):
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo fornecido para atualização.")
        
    updated = repo.update_metadata(meeting_id, fields, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Reunião não encontrada.")
    return {"status": "success", "message": "Metadados atualizados com sucesso."}


@router.post("/save_meeting")
@router.post("/meetings/save")
def save_meeting(req: SaveMeetingRequest):
    new_id = req.meeting_id or str(uuid.uuid4())
    meeting_dict = {
        "ID_MEETING": new_id,
        "ANON_TRANSCRICAO": req.transcript,
        "NOME_SEGMENTO": req.segmento or "Ao Vivo",
        "NIVEL_URGENCIA": "Não Definido",
        "RESPONSAVEL_REUNIAO": "",
        "TEM_PDF": False,
        "STATUS_MEETING": "aguardando_analise" if req.transcript else "COMPLETED",
        "FORMATO_MEETING": "VIDEO"
    }
    saved_id = repo.save_meeting(meeting_dict)
    return {"status": "success", "meeting_id": saved_id}


@router.post("/upload_pdf")
async def upload_pdf(meeting_id: str = Form(...), file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser do tipo PDF.")
        
    content = await file.read()
    if len(content) > 30 * 1024 * 1024:  # 30MB
        raise HTTPException(status_code=400, detail="O arquivo PDF excede o tamanho máximo de 30MB.")
        
    os.makedirs(PDF_DIR, exist_ok=True)
    file_path = pdf_path_for(meeting_id)
    with open(file_path, "wb") as f:
        f.write(content)

    repo.update_metadata(meeting_id, {"TEM_PDF": True}, author="system")
    return {"status": "success", "file_path": f"/pdfs/{meeting_id}.pdf"}


# Endpoints de compatibilidade retroativa
@router.get("/history")
def get_history():
    all_data = repo.get_all()
    return {"status": "success", "data": all_data}


@router.post("/urgency")
def update_urgency_legacy(req: UrgencyRequest):
    updated = repo.update_metadata(req.meeting_id, {"NIVEL_URGENCIA": req.urgency_level}, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"status": "success", "message": "Urgency updated"}


@router.post("/responsible")
def update_responsible_legacy(req: ResponsibleRequest):
    updated = repo.update_metadata(req.meeting_id, {"RESPONSAVEL_REUNIAO": req.responsible}, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"status": "success", "message": "Responsible updated"}


@router.post("/tasks/status")
def update_task_status(req: TaskStatusRequest):
    updated = repo.update_task_status(req.meeting_id, req.task_index, req.status, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting or task not found")
    return {"status": "success", "message": "Task status updated"}
