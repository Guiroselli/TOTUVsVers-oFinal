from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Body

from repositories import MeetingRepository, sync_json_to_sqlite
from analytics_service import AnalyticsService, get_quarter_dates, get_period_dates
from schemas import (
    AnalyticsQuarterResponse, 
    DrilldownMeetingsResponse,
    PeriodComparisonResponse,
    PainsLifecycleResponse,
    ClientTimelineResponse,
    ExecutiveSummaryResponse,
    ExecutiveSummaryRequest
)

router = APIRouter(tags=["Analytics"])
repo = MeetingRepository()


@router.get("/api/analytics/quarter", response_model=AnalyticsQuarterResponse)
def get_quarter_analytics(
    start_date: Optional[str] = Query(None, description="Data de início YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Data de fim YYYY-MM-DD"),
    client_code: Optional[str] = Query(None, description="Código do cliente ou segmento"),
    format: Optional[str] = Query(None, description="Formato da reunião (ex: VIDEO, PRESENCIAL)"),
    status: Optional[str] = Query(None, description="Status da reunião (ex: COMPLETED)"),
    year: Optional[int] = Query(None, description="Ano de referência (ex: 2026)"),
    quarter: Optional[int] = Query(None, description="Trimestre (1, 2, 3 ou 4)"),
    period_type: Optional[str] = Query(None, description="Tipo de período: 'year' (anual), 'semester' (semestral), 'quarter' (trimestral)"),
    period_num: Optional[int] = Query(None, description="Número do semestre (1 ou 2) ou trimestre (1 a 4)")
):
    """
    Retorna métricas agregadas executivas para um ano, semestre, trimestre ou período customizado.
    """
    period_label = "Período Personalizado"
    
    if year and period_type:
        p_num = period_num if period_num is not None else (quarter or 1)
        s_date, e_date, label = get_period_dates(year, period_type, p_num)
        if not start_date:
            start_date = s_date
        if not end_date:
            end_date = e_date
        period_label = label
    elif year and quarter:
        s_date, e_date, label = get_quarter_dates(year, quarter)
        if not start_date:
            start_date = s_date
        if not end_date:
            end_date = e_date
        period_label = label
    elif not start_date and not end_date:
        start_date = "2020-01-01"
        end_date = "2030-12-31"
        period_label = "Todas as Reuniões"
    elif start_date and end_date:
        period_label = f"{start_date} até {end_date}"

    meetings = repo.get_all(
        start_date=start_date,
        end_date=end_date,
        client_code=client_code,
        format_filter=format,
        status_filter=status
    )

    analytics = AnalyticsService.calculate_quarter_analytics(
        meetings=meetings,
        start_date=start_date or "",
        end_date=end_date or "",
        period_label=period_label
    )
    return analytics


@router.get("/api/analytics/compare", response_model=PeriodComparisonResponse)
def compare_periods(
    base_start: str = Query(..., description="Início do período base YYYY-MM-DD"),
    base_end: str = Query(..., description="Fim do período base YYYY-MM-DD"),
    compare_start: str = Query(..., description="Início do período comparativo YYYY-MM-DD"),
    compare_end: str = Query(..., description="Fim do período comparativo YYYY-MM-DD"),
    base_label: str = Query("Período Base"),
    compare_label: str = Query("Período Comparado")
):
    """
    Compara dois intervalos/trimestres calculando matematicamente os deltas e tendências.
    """
    all_meetings = repo.get_all()
    return AnalyticsService.compare_periods(
        meetings=all_meetings,
        base_start=base_start,
        base_end=base_end,
        compare_start=compare_start,
        compare_end=compare_end,
        base_label=base_label,
        compare_label=compare_label
    )


@router.get("/api/analytics/pains/lifecycle", response_model=PainsLifecycleResponse)
def get_pains_lifecycle():
    """
    Retorna o ciclo de vida completo de cada dor mapeada (aparições, evolução, SLA e resolução).
    """
    all_meetings = repo.get_all()
    return AnalyticsService.calculate_pains_lifecycle(all_meetings)


@router.get("/api/clients/{client_code}/timeline", response_model=ClientTimelineResponse)
def get_client_timeline(client_code: str):
    """
    Retorna a linha do tempo executiva de reuniões, dores, tarefas e status de relacionamento do cliente.
    """
    all_meetings = repo.get_all()
    return AnalyticsService.get_client_timeline(all_meetings, client_code)


@router.post("/api/analytics/executive-summary", response_model=ExecutiveSummaryResponse)
def generate_executive_summary(payload: ExecutiveSummaryRequest = Body(...)):
    """
    Gera um resumo executivo com síntese restrita aos dados estruturados pré-calculados.
    """
    all_meetings = repo.get_all()
    start_date = payload.start_date or "2020-01-01"
    end_date = payload.end_date or "2030-12-31"
    return AnalyticsService.generate_executive_summary(
        meetings=all_meetings,
        start_date=start_date,
        end_date=end_date,
        client_code=payload.client_code
    )


@router.get("/api/analytics/quarter/meetings", response_model=DrilldownMeetingsResponse)
def get_drilldown_meetings(
    metric_type: str = Query(..., description="Tipo da métrica"),
    metric_key: str = Query(..., description="Chave específica"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    client_code: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    meetings = repo.get_all(
        start_date=start_date,
        end_date=end_date,
        client_code=client_code,
        format_filter=format,
        status_filter=status
    )

    return AnalyticsService.get_drilldown_meetings(
        meetings=meetings,
        metric_type=metric_type,
        metric_key=metric_key
    )


@router.post("/api/sqlite/sync")
def sync_to_sqlite():
    """Executa a sincronização incremental e não-destrutiva do JSON para SQLite com índices."""
    return sync_json_to_sqlite()
