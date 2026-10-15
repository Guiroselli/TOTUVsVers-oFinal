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

import env_loader  # noqa: F401

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

# CORS configurável por ambiente — sem wildcard (*) como padrão
DEFAULT_LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
if cors_origins_env:
    origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    origins = DEFAULT_LOCAL_ORIGINS

# Credenciais só são permitidas quando não há wildcard "*"
allow_credentials = "*" not in origins and bool(origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Diretório de PDFs (caminho absoluto: funciona rodando de qualquer CWD)
os.makedirs(PDF_DIR, exist_ok=True)
app.mount("/pdfs", StaticFiles(directory=PDF_DIR), name="pdfs")

# Inclui os módulos de rotas
app.include_router(analytics.router)
app.include_router(meetings.router)
app.include_router(integrations.router)

meeting_repo = MeetingRepository()
profile_repo = ProfileRepository()
integrations_repo = IntegrationsRepository()
analysis_service = AnalysisService()
from stt_service import get_stt_service
from ollama_service import get_ollama_service


@app.on_event("startup")
async def startup_event():
    """Garante a conexão e inicialização automática do Ollama em segundo plano no startup."""
    ollama_service = get_ollama_service()
    ollama_service.start_background_connector()


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Proton Flow", "version": "2.0.0"}


@app.get("/api/ollama/status")
def get_ollama_status_endpoint():
    """Retorna o status em tempo real da conexão com o Ollama e modelos carregados."""
    return get_ollama_service().get_status()


@app.post("/api/ollama/start")
def start_ollama_endpoint():
    """Força inicialização/conexão sob demanda com o processo do Ollama."""
    return get_ollama_service().ensure_running(auto_start=True, wait_seconds=8)


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
from typing import Set, List, Tuple

class MeetingConnectionManager:
    """Gerencia conexões WebSocket, pares WebRTC e sinalização isolados estritamente por meeting_id."""
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        # meeting_id -> { participant_id: { "ws": ws, "name": name, "is_muted": bool, "is_cam_off": bool, "joined_at": str } }
        self._peers: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
        # websocket -> (meeting_id, participant_id)
        self._ws_to_peer: Dict[WebSocket, Tuple[str, str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, meeting_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections[meeting_id].add(websocket)

    async def register_peer(
        self,
        meeting_id: str,
        participant_id: str,
        name: str,
        is_muted: bool,
        is_cam_off: bool,
        websocket: WebSocket
    ):
        async with self._lock:
            self._peers[meeting_id][participant_id] = {
                "ws": websocket,
                "participant_id": participant_id,
                "name": name,
                "is_muted": is_muted,
                "is_cam_off": is_cam_off,
                "joined_at": datetime.now().isoformat()
            }
            self._ws_to_peer[websocket] = (meeting_id, participant_id)

    async def update_peer_state(
        self,
        meeting_id: str,
        participant_id: str,
        is_muted: Optional[bool] = None,
        is_cam_off: Optional[bool] = None,
        name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if meeting_id in self._peers and participant_id in self._peers[meeting_id]:
                peer = self._peers[meeting_id][participant_id]
                if is_muted is not None:
                    peer["is_muted"] = is_muted
                if is_cam_off is not None:
                    peer["is_cam_off"] = is_cam_off
                if name is not None and name.strip():
                    peer["name"] = name.strip()
                return {
                    "participant_id": participant_id,
                    "name": peer["name"],
                    "is_muted": peer["is_muted"],
                    "is_cam_off": peer["is_cam_off"]
                }
            return None

    async def unregister_peer(self, websocket: WebSocket) -> Optional[Tuple[str, str, str]]:
        """Remove o peer associado a este websocket e retorna (meeting_id, participant_id, name) se existia."""
        async with self._lock:
            info = self._ws_to_peer.pop(websocket, None)
            if not info:
                return None
            meeting_id, participant_id = info
            name = ""
            if meeting_id in self._peers and participant_id in self._peers[meeting_id]:
                current_entry = self._peers[meeting_id][participant_id]
                # Só desregistra se o socket registrado for o mesmo que está fechando!
                # Se for diferente, o usuário já se reconectou com um novo socket e não deve ser removido!
                if current_entry.get("ws") == websocket:
                    pdata = self._peers[meeting_id].pop(participant_id)
                    name = pdata.get("name", "")
                    if not self._peers[meeting_id]:
                        del self._peers[meeting_id]
                    return meeting_id, participant_id, name
                else:
                    return None
            return None

    async def get_peers_in_room(self, meeting_id: str, exclude_participant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        async with self._lock:
            peers_dict = self._peers.get(meeting_id, {})
            result = []
            for pid, pdata in peers_dict.items():
                if pid != exclude_participant_id:
                    result.append({
                        "participant_id": pid,
                        "name": pdata.get("name", "Participante"),
                        "is_muted": pdata.get("is_muted", False),
                        "is_cam_off": pdata.get("is_cam_off", False),
                        "joined_at": pdata.get("joined_at")
                    })
            return result

    async def send_to_peer(self, meeting_id: str, target_participant_id: str, message: dict):
        ws = None
        async with self._lock:
            peer = self._peers.get(meeting_id, {}).get(target_participant_id)
            if peer:
                ws = peer.get("ws")
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def broadcast_to_meeting(self, meeting_id: str, message: dict, exclude_socket: Optional[WebSocket] = None):
        async with self._lock:
            sockets = list(self._connections.get(meeting_id, set()))
        for ws in sockets:
            if ws is exclude_socket:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def disconnect(self, meeting_id: str, websocket: WebSocket):
        async with self._lock:
            if meeting_id in self._connections:
                self._connections[meeting_id].discard(websocket)
                if not self._connections[meeting_id]:
                    del self._connections[meeting_id]

ws_manager = MeetingConnectionManager()


@app.get("/api/live/meetings/{meeting_id}/participants")
async def get_live_meeting_participants(meeting_id: str):
    """Retorna a lista em tempo real de participantes conectados à sala ao vivo."""
    peers = await ws_manager.get_peers_in_room(meeting_id)
    return {
        "meeting_id": meeting_id,
        "count": len(peers),
        "participants": peers
    }


async def _handle_meeting_websocket(websocket: WebSocket, meeting_id: str, session_id: Optional[str] = None):
    """Lógica central de WebSocket com isolamento estrito por reunião e sinalização WebRTC."""
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

                    if p_type == "join":
                        # Identificação do participante e sinalização de presença na sala
                        pid = str(payload.get("participant_id") or uuid.uuid4())
                        pname = str(payload.get("name") or "Participante").strip() or "Participante"
                        is_muted = bool(payload.get("is_muted", False))
                        is_cam_off = bool(payload.get("is_cam_off", False))

                        await ws_manager.register_peer(meeting_id, pid, pname, is_muted, is_cam_off, websocket)
                        other_peers = await ws_manager.get_peers_in_room(meeting_id, exclude_participant_id=pid)

                        # Envia estado da sala para o participante recém-conectado
                        await websocket.send_json({
                            "type": "room_state",
                            "meeting_id": meeting_id,
                            "participant_id": pid,
                            "peers": other_peers
                        })

                        # Notifica os demais participantes sobre a entrada deste peer
                        await ws_manager.broadcast_to_meeting(meeting_id, {
                            "type": "peer_joined",
                            "meeting_id": meeting_id,
                            "peer": {
                                "participant_id": pid,
                                "name": pname,
                                "is_muted": is_muted,
                                "is_cam_off": is_cam_off
                            }
                        }, exclude_socket=websocket)

                    elif p_type == "webrtc_signal":
                        # Roteamento seguro de oferta, resposta SDP ou candidato ICE entre peers
                        target_id = payload.get("target_id")
                        sender_id = payload.get("sender_id")
                        signal = payload.get("signal")
                        if target_id and signal:
                            await ws_manager.send_to_peer(meeting_id, target_id, {
                                "type": "webrtc_signal",
                                "meeting_id": meeting_id,
                                "sender_id": sender_id,
                                "signal": signal
                            })

                    elif p_type == "peer_state":
                        # Atualização de estado do participante (mute, câmera, nome)
                        pid = payload.get("participant_id")
                        if pid:
                            updated = await ws_manager.update_peer_state(
                                meeting_id,
                                pid,
                                is_muted=payload.get("is_muted"),
                                is_cam_off=payload.get("is_cam_off"),
                                name=payload.get("name")
                            )
                            if updated:
                                await ws_manager.broadcast_to_meeting(meeting_id, {
                                    "type": "peer_state_updated",
                                    "meeting_id": meeting_id,
                                    "participant_id": pid,
                                    "is_muted": updated["is_muted"],
                                    "is_cam_off": updated["is_cam_off"],
                                    "name": updated["name"]
                                }, exclude_socket=websocket)

                    elif p_type == "transcript":
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
        peer_info = await ws_manager.unregister_peer(websocket)
        if peer_info:
            m_id, pid, pname = peer_info
            await ws_manager.broadcast_to_meeting(m_id, {
                "type": "peer_left",
                "meeting_id": m_id,
                "participant_id": pid,
                "name": pname
            })
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


# Suporte para servir o Frontend (SPA) quando compilado em frontend/dist
from fastapi.responses import FileResponse

FRONTEND_DIST = os.path.abspath(os.path.join(_current_dir, "..", "frontend", "dist"))
if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("pdfs/") or full_path.startswith("ws/") or full_path == "docs" or full_path == "openapi.json":
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend index.html não encontrado")

