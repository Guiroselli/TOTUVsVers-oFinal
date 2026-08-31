from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime


class TaskSchema(BaseModel):
    responsavel: str = "Não identificado"
    tarefa: str
    prazo: Optional[str] = "Não mencionado"
    prazo_iso: Optional[str] = None
    prazo_confidence: Optional[float] = 1.0
    prazo_parse_status: Optional[str] = "not_mentioned"  # "parsed" | "ambiguous" | "not_mentioned"
    status: Optional[str] = "Não Inicializado"
    prioridade: Optional[str] = "Média"  # "Baixa" | "Média" | "Alta" | "Crítica"
    confidence: Optional[float] = 1.0
    evidencia: Optional[str] = ""
    evidence: Optional[str] = ""
    meeting_id: Optional[str] = None
    task_validation_status: Optional[str] = "valid"  # "valid" | "pending_review" | "rejected_noise"
    validation_reason: Optional[str] = None


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


class CandidateResponsible(BaseModel):
    name: str
    score: float = 0.0
    reasons: List[str] = []
    evidence: str = ""


class FieldSuggestion(BaseModel):
    field_name: str
    label: Optional[str] = None
    suggested_value: Any
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    evidence: str = ""
    review_status: str = "pending"  # "pending" | "confirmed" | "rejected" | "edited"
    confirmed_value: Optional[Any] = None
    candidates: Optional[List[CandidateResponsible]] = None
    reasons: Optional[List[str]] = None


class TOTVSProductRecommendation(BaseModel):
    id: Optional[str] = None
    recommendation_id: Optional[str] = None
    meeting_id: Optional[str] = None
    product_key: str
    product_name: str
    product_area: str
    fit_score: float
    confidence: float
    confidence_label: Optional[str] = "Média"
    is_strong_recommendation: Optional[bool] = True
    why_recommended: str
    trigger_pains: List[Dict[str, Any]] = []
    trigger_tasks: List[Dict[str, Any]] = []
    all_evidences: Optional[List[str]] = []
    recommended_capabilities: List[str] = []
    expected_benefits: List[str] = []
    implementation_next_step: str
    required_inputs: List[str] = []
    missing_data: Optional[List[str]] = []
    integration_status: str = "simulated"  # "real" | "simulated" | "unconfigured"
    source: str = "rule_plus_catalog"  # "rule" | "llama" | "rule_plus_catalog"
    review_status: str = "pending"  # "pending" | "confirmed" | "rejected"
    score_breakdown: Optional[Dict[str, float]] = None
    contributing_signals: Optional[List[str]] = []
    negated_signals: Optional[List[str]] = []
    catalog_version: Optional[str] = "2.1.0"
    prompt_version: Optional[str] = "2.1.0"
    model_version: Optional[str] = "llama3:latest"
    created_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = []


class ManagerialAlert(BaseModel):
    id: str
    type: str  # 11 types supported
    title: str
    description: str
    severity: str = "warning"  # "critical" | "warning" | "info"
    meeting_id: Optional[str] = None
    client_code: Optional[str] = None
    metric_key: Optional[str] = None
    count: Optional[int] = 1
    action_type: Optional[str] = None  # "filter_meetings" | "open_client" | "view_tasks"
    action_target: Optional[str] = None
    affected_clients: Optional[List[str]] = []
    sample_evidence: Optional[str] = None


class TaskGroupSuggestion(BaseModel):
    group_title: str
    similarity_reason: str
    task_indexes: List[int] = []
    meeting_ids: List[str] = []
    tasks: List[TaskSchema] = []
    is_duplicate: bool = False


class RejectedTaskAudit(BaseModel):
    texto_original: str
    motivo_rejeicao: str
    origem: str = "llm"  # "llm" | "fallback"
    data_analise: str = Field(default_factory=lambda: datetime.now().isoformat())


class AnalysisMetadata(BaseModel):
    model: str = "llama3"
    model_name: Optional[str] = "llama3"
    prompt_version: str = "2.1.0"
    catalog_version: str = "2.1.0"
    analyzed_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    duration_seconds: Optional[float] = 0.0
    transcript_char_count: Optional[int] = 0
    status: str = "success"  # "success" | "insufficient_data" | "fallback_success" | "ollama_offline" | "json_decode_error" | "error"
    analysis_engine: str = "ollama"  # "ollama" | "deterministic_fallback"
    analysis_status: Optional[str] = "analise_concluida"  # "analise_concluida" | "analise_concluida_dados_insuficientes" | "fallback_deterministico" | "analise_com_erro" | "analise_parcial"
    technical_confidence: Optional[str] = "Processamento concluído com sucesso"
    semantic_confidence: Optional[str] = "Alta (85%)"
    analysis_confidence: Optional[float] = 0.85
    confidence_reason: Optional[str] = None
    insufficient_data_reason: Optional[str] = None
    valid_items_count: Optional[int] = 0
    pending_items_count: Optional[int] = 0
    items_discarded_noise: Optional[int] = 0
    rejected_tasks_audit: List[RejectedTaskAudit] = []
    warning: Optional[str] = None
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
    recomendacoes_totvs: Optional[List[TOTVSProductRecommendation]] = []
    alertas: Optional[List[ManagerialAlert]] = []
    analise_metadados: Optional[AnalysisMetadata] = None
    perfil_cliente: Optional[Dict[str, Any]] = None
    codigo_cliente: Optional[str] = None


class MeetingSchema(BaseModel):
    ID_MEETING: str
    DT_MEETING: Optional[str] = None
    FORMATO_MEETING: Optional[str] = "VIDEO"
    DURACAO_MEETING: Optional[str] = ""
    STATUS_MEETING: Optional[str] = "COMPLETED"
    STATUS_ANALISE: Optional[str] = "analise_concluida"
    STATUS_REVISAO: Optional[str] = "revisao_pendente"
    NOME_SEGMENTO: Optional[str] = "Geral"
    client_code: Optional[str] = None
    segment: Optional[str] = None
    meeting_source: Optional[str] = "historico"
    client_identity_status: Optional[str] = "valid_client"
    NOTA_NPS: Optional[Union[str, int, float]] = None
    ANON_TRANSCRICAO: Optional[str] = ""
    NIVEL_URGENCIA: Optional[str] = ""
    RESPONSAVEL_REUNIAO: Optional[str] = ""
    TEM_PDF: Optional[bool] = False
    RESUMO_IA: Optional[Union[MeetingAnalysisResult, Dict[str, Any]]] = None
    field_suggestions: Optional[Dict[str, FieldSuggestion]] = None
    recomendacoes_totvs: Optional[List[TOTVSProductRecommendation]] = None


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


class RecommendationActionRequest(BaseModel):
    action: str  # "confirm" | "reject"


class MetadataUpdateRequest(BaseModel):
    responsavel_reuniao: Optional[str] = None
    nivel_urgencia: Optional[str] = None
    tema: Optional[str] = None
    nome_segmento: Optional[str] = None
    status_meeting: Optional[str] = None
    RESPONSAVEL_REUNIAO: Optional[str] = None
    NIVEL_URGENCIA: Optional[str] = None
    NOME_SEGMENTO: Optional[str] = None
    STATUS_MEETING: Optional[str] = None


class IntegracaoConfigRequest(BaseModel):
    sistema: str
    webhook_url: str


class EnviarIntegracaoRequest(BaseModel):
    sistema: str
    meeting_id: str
    tarefas: List[Dict[str, Any]] = []
    modo_simulado: Optional[bool] = False
    recommendation_id: Optional[str] = None


# Analytics, Comparisons & Timelines
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


class SegmentUnidentifiedMetric(BaseModel):
    segment_or_source: str
    total_reunioes: int
    total_dores: int
    dores_principais: List[str] = []
    urgencia_maxima: str = "Não Definido"
    acoes_pendentes: int = 0


class UrgencyDistributionMetric(BaseModel):
    critica: int = 0
    alta: int = 0
    media: int = 0
    baixa: int = 0
    nao_definido: int = 0


class TimeSeriesPoint(BaseModel):
    periodo: str
    label: str
    total_reunioes: int
    reunioes_analisadas: int
    total_dores: int
    total_tarefas: int


class DataQualityMetrics(BaseModel):
    total_reunioes: int = 0
    reunioes_com_transcricao: int = 0
    reunioes_sem_transcricao: int = 0
    reunioes_analisadas: int = 0
    reunioes_sem_analise: int = 0
    clientes_identificados: int = 0
    reunioes_sem_cliente: int = 0
    datas_validas: int = 0
    datas_invalidas: int = 0
    total_tarefas: int = 0
    tarefas_com_responsavel: int = 0
    tarefas_sem_responsavel: int = 0
    tarefas_com_prazo: int = 0
    tarefas_sem_prazo: int = 0
    analises_antigas: int = 0
    falhas_ia: int = 0
    score_qualidade_dados: float = 100.0
    score_qualidade_ia: float = 100.0
    score_qualidade: float = 100.0
    calculation_breakdown: Optional[Dict[str, Any]] = None


class AnalyticsQuarterResponse(BaseModel):
    period: Dict[str, Any]
    meetings: Dict[str, int]
    top_topics: List[TopicMetric]
    recurring_pains: List[PainMetric]
    open_actions: int
    overdue_actions: int
    total_actions: int
    clients_at_risk: List[ClientRiskMetric]
    segments_unidentified: List[SegmentUnidentifiedMetric] = []
    urgency_distribution: UrgencyDistributionMetric
    time_series: List[TimeSeriesPoint]
    data_quality: DataQualityMetrics
    nps_stats: Dict[str, Any]
    managerial_alerts: List[ManagerialAlert] = []
    duplicate_task_groups: List[Dict[str, Any]] = []


class PeriodComparisonTopic(BaseModel):
    topic_key: str
    label: str
    base_count: int
    compare_count: int
    delta_count: int
    delta_percent: float
    trend: str  # "aumentou" | "diminuiu" | "estavel"


class PeriodComparisonResponse(BaseModel):
    base_period: Dict[str, Any]
    compare_period: Dict[str, Any]
    total_meetings_base: int
    total_meetings_compare: int
    total_meetings_delta: int
    topics_comparison: List[PeriodComparisonTopic]
    new_pains: List[str]
    resolved_pains: List[str]
    persisting_pains: List[str]
    clients_entering_risk: List[str]
    open_actions_delta: int
    completed_actions_delta: int
    urgency_delta: Dict[str, int]


class PainLifecycleItem(BaseModel):
    categoria: str
    label: str
    cor: str
    sistema_totvs: str
    first_seen_date: Optional[str] = None
    last_seen_date: Optional[str] = None
    meetings_count: int = 0
    affected_clients_count: int = 0
    affected_clients: List[str] = []
    related_tasks_count: int = 0
    completed_tasks_count: int = 0
    overdue_tasks_count: int = 0
    current_urgency: str = "Média"
    trend: str = "estavel"  # "aumentando" | "estavel" | "reduzindo"
    has_unresolved_alert: bool = False
    associated_totvs_product: str = "TOTVS Fluig"


class PainsLifecycleResponse(BaseModel):
    total_pains_tracked: int
    critical_unresolved_pains_count: int
    items: List[PainLifecycleItem]


class ClientTimelineItem(BaseModel):
    meeting_id: str
    date: Optional[str] = None
    tema: Optional[str] = None
    urgencia: Optional[str] = None
    dores: List[str] = []
    tarefas_total: int = 0
    tarefas_concluidas: int = 0
    tarefas_vencidas: int = 0
    decisao: Optional[str] = None
    recomendacoes_totvs: List[str] = []
    status_meeting: Optional[str] = "analise_concluida"


class ClientTimelineResponse(BaseModel):
    client_code: str
    total_meetings: int
    first_meeting_date: Optional[str] = None
    last_meeting_date: Optional[str] = None
    relationship_health: str = "Saudável"  # "Saudável" | "Atenção" | "Crítico"
    recurrent_pains: Dict[str, int] = {}
    overdue_tasks_count: int = 0
    open_tasks_count: int = 0
    timeline: List[ClientTimelineItem]


class ExecutiveSummaryRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    client_code: Optional[str] = None


class ExecutiveSummaryResponse(BaseModel):
    period_label: str
    principais_assuntos: List[str]
    dores_persistentes: List[str]
    decisoes_relevantes: List[str]
    tarefas_criticas: List[Dict[str, Any]]
    recomendacoes_proximos_passos: List[str]
    resumo_executivo_texto: str
    dados_estruturados: Dict[str, Any]


class IdempotentIntegrationReceipt(BaseModel):
    request_hash: str
    meeting_id: str
    sistema: str
    status: str  # "enviado_real" | "simulado" | "pendente" | "falha"
    attempt_count: int = 1
    last_attempt_at: str
    tarefas_count: int
    mensagem_usuario: str
    simulado: bool = True
    response_summary: Optional[Dict[str, Any]] = None


class PaginatedMeetingsResponse(BaseModel):
    items: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int


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
