import os
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, Depends

from repositories import MeetingRepository, ProfileRepository
from schemas import (
    PaginatedMeetingsResponse, 
    MeetingSchema, 
    SuggestionActionRequest, 
    MetadataUpdateRequest,
    SaveMeetingRequest,
    UrgencyRequest,
    ResponsibleRequest,
    TaskStatusRequest
)
from normalization import normalize_client_code, normalize_urgency

router = APIRouter(prefix="/api", tags=["Meetings"])
repo = MeetingRepository()
profile_repo = ProfileRepository()


@router.get("/meetings", response_model=PaginatedMeetingsResponse)
def list_meetings(
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(10, ge=1, le=100, description="Itens por página"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    client_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
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
        status_filter=status,
        format_filter=format,
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
def save_meeting(req: SaveMeetingRequest):
    new_id = req.meeting_id or str(uuid.uuid4())
    meeting_dict = {
        "ID_MEETING": new_id,
        "ANON_TRANSCRICAO": req.transcript,
        "NOME_SEGMENTO": req.segmento or "Ao Vivo",
        "NIVEL_URGENCIA": "Não Definido",
        "RESPONSAVEL_REUNIAO": "",
        "TEM_PDF": False,
        "STATUS_MEETING": "COMPLETED",
        "FORMATO_MEETING": "VIDEO"
    }
    saved_id = repo.save_meeting(meeting_dict)
    return {"status": "success", "meeting_id": saved_id}


@router.post("/upload_pdf")
async def upload_pdf(meeting_id: str = Form(...), file: UploadFile = File(...)):
    # Validação de tipo e tamanho
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser do tipo PDF.")
        
    content = await file.read()
    if len(content) > 30 * 1024 * 1024:  # 30MB
        raise HTTPException(status_code=400, detail="O arquivo PDF excede o tamanho máximo de 30MB.")
        
    os.makedirs("pdfs", exist_ok=True)
    file_path = f"pdfs/{meeting_id}.pdf"
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


@router.post("/task_status")
def update_task_status_legacy(req: TaskStatusRequest):
    updated = repo.update_task_status(req.meeting_id, req.task_index, req.status, author="user")
    if not updated:
        raise HTTPException(status_code=404, detail="Meeting or task not found")
    return {"status": "success", "message": "Task status updated"}


@router.get("/perfil_cliente/{codigo}")
def get_perfil_cliente(codigo: str):
    return profile_repo.get_profile(codigo)


@router.get("/audit")
def get_audit_log(meeting_id: Optional[str] = Query(None)):
    return repo.get_audit_events(meeting_id=meeting_id)
