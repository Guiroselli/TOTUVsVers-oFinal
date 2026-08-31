import os
import sys
import tempfile
from typing import Optional
from datetime import datetime

# Garante que o diretório backend esteja no sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from repositories import MeetingRepository, ProfileRepository, IntegrationsRepository
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

# Diretório de PDFs
os.makedirs("pdfs", exist_ok=True)
app.mount("/pdfs", StaticFiles(directory="pdfs"), name="pdfs")

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

# Inicialização segura do Whisper
whisper_model = None
try:
    from faster_whisper import WhisperModel
    print("Iniciando modelo Whisper...")
    whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
except Exception as e:
    print(f"Aviso: Faster-Whisper não pôde ser carregado: {e}")


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
                    ultimas = "; ".join(r.get("tema", "") for r in perfil.get("reunioes", [])[:3] if r.get("tema"))
                    contexto_perfil = (
                        f"PERFIL DO CLIENTE {codigo_cliente} — {n_reunioes} reunião(ões) anteriores no histórico. "
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


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    Endpoint WebSocket para transcrição ao vivo por streaming de chunks de áudio com Whisper.
    """
    await websocket.accept()
    if not whisper_model:
        await websocket.send_json({"error": "Modelo Whisper não está carregado no servidor."})
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_bytes()
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
                temp_file.write(data)
                temp_path = temp_file.name

            try:
                segments, info = whisper_model.transcribe(temp_path, beam_size=5)
                text = " ".join([segment.text for segment in segments]).strip()
                if text:
                    await websocket.send_json({"text": text})
            except Exception as e:
                print(f"Erro na transcrição do chunk: {e}")
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Erro na conexão WebSocket: {e}")
