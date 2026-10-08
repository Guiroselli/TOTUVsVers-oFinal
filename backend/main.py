import os
import sys
import tempfile
import json
import uuid
import asyncio
from typing import Optional, Dict, Set, Any
from datetime import datetime

# Garante que o diretório backend esteja no sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from repositories import MeetingRepository, ProfileRepository, IntegrationsRepository, PDF_DIR
from analysis_service import AnalysisService
from schemas import TranscriptionRequest, MeetingAnalysisResult
from routers import analytics, meetings, integrations

app = FastAPI(
    title="Proton Flow API",
    description="Plataforma de Inteligência Gerencial e Síntese de Reuniões Corporativas TOTVS",
    version="2.0.0"
)

# CORS configurável por ambiente
cors_origins_env = os.getenv("CORS_ORIGINS", "*")
if cors_origins_env == "*":
    origins = ["*"]
else:
    origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Diretório de PDFs (caminho absoluto: funciona rodando de qualquer CWD)
os.makedirs(PDF_DIR, exist_ok=True)
app.mount("/pdfs", StaticFiles(directory=PDF_DIR), name="pdfs")

# Inclui os módulos de rotas
app.include_router(analytics.router)
app.include_router(meetings.router)
app.include_router(integrations.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Proton Flow", "version": "2.0.0"}

meeting_repo = MeetingRepository()
profile_repo = ProfileRepository()
integrations_repo = IntegrationsRepository()
analysis_service = AnalysisService()
from stt_service import get_stt_service


@app.get("/health")
def health_check_legacy():
    return {
        "status": "ok",
        "app": "Proton Flow API",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/analyze", response_model=MeetingAnalysisResult)
async def analyze_text(request: TranscriptionRequest):
    """
    Analisa a transcrição da reunião com IA (Ollama), aplicando regras determinísticas,
    enriquecimento com perfil histórico do cliente e geração de sugestões de metadados.
    """
    if not request.text or len(request.text.strip()) < 5:
        raise HTTPException(status_code=400, detail="Transcrição muito curta ou vazia para análise.")

    # 1. Recupera perfil do cliente se houver meeting_id
    codigo_cliente = ""
    contexto_perfil = ""
    meeting_date_str = None
    existing = None
    if request.meeting_id:
        existing = meeting_repo.get_by_id(request.meeting_id)
        if existing:
            codigo_cliente = existing.get("NOME_SEGMENTO", "")
            meeting_date_str = existing.get("DT_MEETING")
            if codigo_cliente:
                perfil = profile_repo.get_profile(codigo_cliente)
                n_reunioes = len(perfil.get("reunioes", []))
                if n_reunioes > 0:
                    dores_rec = perfil.get("dores_recorrentes", {})
                    top_dores = sorted(dores_rec.items(), key=lambda x: -x[1])[:3]
                    dores_txt = ", ".join(f"{k} ({v}x)" for k, v in top_dores) or "nenhuma"
                    reunioes_perfil_str = "1 reunião anterior" if n_reunioes == 1 else f"{n_reunioes} reuniões anteriores"
                    contexto_perfil = (
                        f"PERFIL DO CLIENTE {codigo_cliente} — {reunioes_perfil_str} no histórico. "
                        f"Dores recorrentes: {dores_txt}. Temas recentes: {ultimas or 'nenhum registrado'}."
                    )

    # 2. Executa a análise via AnalysisService
    cfg = integrations_repo.get_config()
    profile = profile_repo.get_profile(codigo_cliente) if codigo_cliente else None
    result = analysis_service.analyze(
        transcript=request.text, 
        client_context=contexto_perfil,
        meeting_date_str=meeting_date_str,
        perfil_cliente=profile,
        integracoes_config=cfg
    )
    
    # 3. Registra reunião no perfil do cliente
    if codigo_cliente:
        profile_repo.register_meeting(
            client_code=codigo_cliente,
            meeting_id=request.meeting_id or "nova",
            date_str=meeting_date_str or datetime.now().strftime("%Y-%m-%d"),
            tema=result.tema,
            dores=result.dores
        )
        result.perfil_cliente = profile_repo.get_profile(codigo_cliente)
        result.codigo_cliente = codigo_cliente

    # 4. Persiste a análise na reunião se meeting_id existir
    if request.meeting_id:
        meeting_repo.update_analysis(request.meeting_id, result.model_dump())
        meeting_repo.update_metadata(request.meeting_id, {"STATUS_MEETING": "analise_concluida"}, author="system")

    return result


from collections import defaultdict
from typing import Set

class MeetingConnectionManager:
    """Gerencia conexões WebSocket isoladas estritamente por meeting_id."""
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, meeting_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections[meeting_id].add(websocket)

    async def disconnect(self, meeting_id: str, websocket: WebSocket):
        async with self._lock:
            if meeting_id in self._connections:
                self._connections[meeting_id].discard(websocket)
                if not self._connections[meeting_id]:
                    del self._connections[meeting_id]

    async def broadcast_to_meeting(self, meeting_id: str, message: dict):
        async with self._lock:
            sockets = list(self._connections.get(meeting_id, set()))
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                pass

ws_manager = MeetingConnectionManager()


async def _handle_meeting_websocket(websocket: WebSocket, meeting_id: str, session_id: Optional[str] = None):
    """Lógica central de WebSocket com isolamento estrito por reunião."""
    await ws_manager.connect(meeting_id, websocket)
    await websocket.send_json({
        "type": "connected",
        "meeting_id": meeting_id,
        "session_id": session_id or str(uuid.uuid4()),
        "whisper_available": get_stt_service().is_available()
    })

    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                data = message["bytes"]
                stt = get_stt_service()
                if stt.is_available():
                    try:
                        res = await stt.transcribe_audio_async(
                            audio_bytes=data,
                            filename_hint=f"chunk_{meeting_id[:8]}.webm",
                            session_id=session_id
                        )
                        text = res.get("text", "")
                        if text:
                            # Atualiza transcrição de forma isolada no repositório
                            meeting_repo.update_live_transcript(meeting_id, text, is_incremental=True)
                            await ws_manager.broadcast_to_meeting(meeting_id, {
                                "type": "transcript_chunk",
                                "meeting_id": meeting_id,
                                "text": text
                            })
                    except Exception as e:
                        print(f"Erro na transcrição STT para reunião {meeting_id}: {e}")
                else:
                    await websocket.send_json({
                        "type": "warning",
                        "meeting_id": meeting_id,
                        "message": "STT backend offline no servidor. Transcrição via navegador ou digitação manual ativa."
                    })
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    p_type = payload.get("type")
                    if p_type == "transcript":
                        txt = payload.get("text", "")
                        is_inc = payload.get("is_incremental", False)
                        meeting_repo.update_live_transcript(meeting_id, txt, is_incremental=is_inc)
                        await ws_manager.broadcast_to_meeting(meeting_id, {
                            "type": "transcript_update",
                            "meeting_id": meeting_id,
                            "text": txt
                        })
                    elif p_type == "status":
                        action = payload.get("action", "")
                        updated = meeting_repo.update_live_meeting_status(meeting_id, action)
                        if updated:
                            await ws_manager.broadcast_to_meeting(meeting_id, {
                                "type": "status_update",
                                "meeting_id": meeting_id,
                                "status": updated.get("STATUS_MEETING")
                            })
                except json.JSONDecodeError:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Erro na conexão WebSocket da reunião {meeting_id}: {e}")
    finally:
        await ws_manager.disconnect(meeting_id, websocket)


@app.websocket("/ws/transcribe/{meeting_id}")
async def websocket_transcribe_by_id(websocket: WebSocket, meeting_id: str, session_id: Optional[str] = None):
    """Endpoint WebSocket isolado por ID estável de reunião."""
    await _handle_meeting_websocket(websocket, meeting_id, session_id)


@app.websocket("/ws/transcribe")
async def websocket_transcribe_legacy(websocket: WebSocket, meeting_id: Optional[str] = None, session_id: Optional[str] = None):
    """Endpoint WebSocket com compatibilidade retroativa suportando query param meeting_id."""
    effective_id = meeting_id or "default_live_meeting"
    await _handle_meeting_websocket(websocket, effective_id, session_id)
