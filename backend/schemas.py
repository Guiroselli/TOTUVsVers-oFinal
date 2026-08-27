from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime


class TaskSchema(BaseModel):
    responsavel: str = "Não identificado"
    tarefa: str
    prazo: Optional[str] = "Não mencionado"
    prazo_iso: Optional[str] = None
    status: Optional[str] = "Não Inicializado"
    confidence: Optional[float] = 1.0
    evidence: Optional[str] = ""


class PainSchema(BaseModel):
    categoria: str = "outro"
    label: Optional[str] = None
    descricao: str = ""
    trecho: Optional[str] = ""
    severidade: Optional[str] = "Média"
    sistema_totvs: Optional[str] = "fluig"


class TopicGroupSchema(BaseModel):
    tema: str
    tema_canonico: Optional[str] = "geral"
    topicos: List[str] = []


class ContextoSchema(BaseModel):
    problema: Optional[str] = "Não mencionado"
    decisao: Optional[str] = "Não mencionado"


class FieldSuggestion(BaseModel):
    field_name: str
    label: Optional[str] = None
    suggested_value: Any
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    evidence: str = ""
    review_status: str = "pending"  # "pending" | "confirmed" | "rejected"
    confirmed_value: Optional[Any] = None


class AnalysisMetadata(BaseModel):
    model: str = "llama3"
    prompt_version: str = "v2"
    analyzed_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    duration_seconds: Optional[float] = 0.0
    transcript_char_count: Optional[int] = 0
    status: str = "success"
    parsing_error: Optional[str] = None


class MeetingAnalysisResult(BaseModel):
    tema: str = "Reunião Geral"
    contexto: Optional[ContextoSchema] = ContextoSchema()
    organizacao_por_temas: List[TopicGroupSchema] = []
    tarefas: List[TaskSchema] = []
    dores: List[Union[PainSchema, str, Dict[str, Any]]] = []
    responsavel_reuniao: Optional[str] = "Não identificado"
    participantes: List[str] = []
    nivel_urgencia: str = "Média"
    justificativa_urgencia: Optional[str] = ""
    confianca_urgencia: float = 0.8
    field_suggestions: Dict[str, FieldSuggestion] = {}
    analise_metadados: Optional[AnalysisMetadata] = None
    perfil_cliente: Optional[Dict[str, Any]] = None
    codigo_cliente: Optional[str] = None


class MeetingSchema(BaseModel):
    ID_MEETING: str
    DT_MEETING: Optional[str] = None
    FORMATO_MEETING: Optional[str] = "VIDEO"
    DURACAO_MEETING: Optional[str] = ""
    STATUS_MEETING: Optional[str] = "COMPLETED"
    NOME_SEGMENTO: Optional[str] = "Geral"
    NOTA_NPS: Optional[Union[str, int, float]] = None
    ANON_TRANSCRICAO: Optional[str] = ""
    NIVEL_URGENCIA: Optional[str] = ""
    RESPONSAVEL_REUNIAO: Optional[str] = ""
    TEM_PDF: Optional[bool] = False
    RESUMO_IA: Optional[Union[MeetingAnalysisResult, Dict[str, Any]]] = None
    field_suggestions: Optional[Dict[str, FieldSuggestion]] = None


# Requests
class TranscriptionRequest(BaseModel):
    text: str
    meeting_id: Optional[str] = None


class UrgencyRequest(BaseModel):
    meeting_id: str
    urgency_level: str


class ResponsibleRequest(BaseModel):
    meeting_id: str
    responsible: str


class TaskStatusRequest(BaseModel):
    meeting_id: str
    task_index: int
    status: str


class SaveMeetingRequest(BaseModel):
    transcript: str
    meeting_id: Optional[str] = None
    segmento: Optional[str] = "Ao Vivo"


class SuggestionActionRequest(BaseModel):
    action: str  # "confirm" | "edit" | "reject"
    value: Optional[Any] = None


class MetadataUpdateRequest(BaseModel):
    responsavel_reuniao: Optional[str] = None
    nivel_urgencia: Optional[str] = None
    tema: Optional[str] = None
    nome_segmento: Optional[str] = None
    status_meeting: Optional[str] = None


class IntegracaoConfigRequest(BaseModel):
    sistema: str
    webhook_url: str


class EnviarIntegracaoRequest(BaseModel):
    sistema: str
    meeting_id: str
    tarefas: List[Dict[str, Any]] = []


# Responses
class PaginatedMeetingsResponse(BaseModel):
    items: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int


class TopicMetric(BaseModel):
    key: str
    label: str
    reunioes_com_tema: int
    ocorrencias: int
    percentual_reunioes: float


class PainMetric(BaseModel):
    categoria: str
    label: str
    cor: str
    sistema_totvs: str
    severidade: str
    reunioes_afetadas: int
    total_ocorrencias: int
    percentual_reunioes: float


class ClientRiskMetric(BaseModel):
    codigo_cliente: str
    total_reunioes: int
    total_dores: int
    dores_principais: List[str]
    urgencia_maxima: str
    acoes_pendentes: int


class UrgencyDistributionMetric(BaseModel):
    critica: int = 0
    alta: int = 0
    media: int = 0
    baixa: int = 0
    nao_definido: int = 0


class TimeSeriesPoint(BaseModel):
    periodo: str  # YYYY-MM ou YYYY-Www
    label: str
    total_reunioes: int
    reunioes_analisadas: int
    total_dores: int
    total_tarefas: int


class DataQualityMetrics(BaseModel):
    reunioes_sem_transcricao: int = 0
    reunioes_sem_analise: int = 0
    reunioes_sem_cliente: int = 0
    datas_invalidas: int = 0
    analises_antigas: int = 0
    falhas_ia: int = 0
    total_reunioes: int = 0
    score_qualidade: float = 100.0


class AnalyticsQuarterResponse(BaseModel):
    period: Dict[str, Any]
    meetings: Dict[str, int]
    top_topics: List[TopicMetric]
    recurring_pains: List[PainMetric]
    open_actions: int
    overdue_actions: int
    total_actions: int
    clients_at_risk: List[ClientRiskMetric]
    urgency_distribution: UrgencyDistributionMetric
    time_series: List[TimeSeriesPoint]
    data_quality: DataQualityMetrics
    nps_stats: Dict[str, Any]


class DrilldownItem(BaseModel):
    meeting_id: str
    data: Optional[str] = None
    cliente: Optional[str] = None
    urgencia: Optional[str] = None
    tema: Optional[str] = None
    evidencias: List[str] = []


class DrilldownMeetingsResponse(BaseModel):
    metric_type: str
    metric_key: str
    total: int
    items: List[DrilldownItem]


class AuditEvent(BaseModel):
    id: str
    timestamp: str
    meeting_id: str
    action: str
    field_name: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    author: str = "user"
