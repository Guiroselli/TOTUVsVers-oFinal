from typing import Optional
from fastapi import APIRouter, Query, HTTPException

from repositories import MeetingRepository
from analytics_service import AnalyticsService, get_quarter_dates
from schemas import AnalyticsQuarterResponse, DrilldownMeetingsResponse

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
repo = MeetingRepository()


@router.get("/quarter", response_model=AnalyticsQuarterResponse)
def get_quarter_analytics(
    start_date: Optional[str] = Query(None, description="Data de início YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Data de fim YYYY-MM-DD"),
    client_code: Optional[str] = Query(None, description="Código do cliente ou segmento"),
    format: Optional[str] = Query(None, description="Formato da reunião (ex: VIDEO, PRESENCIAL)"),
    status: Optional[str] = Query(None, description="Status da reunião (ex: COMPLETED)"),
    year: Optional[int] = Query(None, description="Ano do trimestre (ex: 2026)"),
    quarter: Optional[int] = Query(None, description="Trimestre (1, 2, 3 ou 4)")
):
    """
    Retorna métricas agregadas executivas para um trimestre ou período customizado.
    """
    period_label = "Período Personalizado"
    
    # Se ano e trimestre foram informados
    if year and quarter:
        s_date, e_date, label = get_quarter_dates(year, quarter)
        if not start_date:
            start_date = s_date
        if not end_date:
            end_date = e_date
        period_label = label
    elif not start_date and not end_date:
        # Fallback default: Todo o ano atual ou todo o dataset
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


@router.get("/quarter/meetings", response_model=DrilldownMeetingsResponse)
def get_drilldown_meetings(
    metric_type: str = Query(..., description="Tipo da métrica (topic, pain, urgency, client, overdue_actions, open_actions, unanalyzed)"),
    metric_key: str = Query(..., description="Chave específica (ex: aprovacao_pendente, financeiro, Alta)"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    client_code: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """
    Permite abrir as reuniões e evidências textuais que originaram determinado resultado.
    """
    meetings = repo.get_all(
        start_date=start_date,
        end_date=end_date,
        client_code=client_code,
        format_filter=format,
        status_filter=status
    )

    result = AnalyticsService.get_drilldown_meetings(
        meetings=meetings,
        metric_type=metric_type,
        metric_key=metric_key
    )
    return result
