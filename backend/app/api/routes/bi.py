from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.bi import Chart, Dashboard, DashboardWidget, ReportSchedule, SemanticDataset
from app.schemas.common import ApiMessage
from app.schemas.bi import (
    ChartListResponse,
    ChartCreateRequest,
    ChartRead,
    ChartPreviewResponse,
    DashboardListResponse,
    DashboardCreateRequest,
    DashboardDetailResponse,
    DatasetPreviewResponse,
    DatasetExplorerResponse,
    ReportScheduleCreateRequest,
    ReportScheduleListResponse,
    ReportScheduleRead,
    SemanticDatasetCreateRequest,
    SemanticDatasetRead,
)
from app.services.bi_service import BiService


router = APIRouter(prefix="/bi", tags=["bi"])
bi_service = BiService()


@router.get("/datasets", response_model=DatasetExplorerResponse)
def list_datasets(db: Session = Depends(get_db)) -> DatasetExplorerResponse:
    stored = db.query(SemanticDataset).order_by(SemanticDataset.updated_at.desc()).all()
    candidates = bi_service.list_candidate_datasets(db)
    return DatasetExplorerResponse(items=stored, candidates=candidates)


@router.post("/datasets", response_model=SemanticDatasetRead)
def create_dataset(payload: SemanticDatasetCreateRequest, db: Session = Depends(get_db)) -> SemanticDatasetRead:
    data = payload.model_dump(by_alias=True)
    data["name"] = bi_service.resolve_dataset_name(db, payload.name)
    record = SemanticDataset(**data)
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A dataset with this name already exists. Please try again.") from exc
    db.refresh(record)
    return record


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def preview_dataset(dataset_id: str, db: Session = Depends(get_db)) -> DatasetPreviewResponse:
    dataset = db.query(SemanticDataset).filter(SemanticDataset.id == dataset_id).one_or_none()
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.source_type != "delta_table":
        raise HTTPException(status_code=400, detail="Preview is currently supported only for Delta table datasets")
    preview = bi_service.preview_delta_source(db, table_name=dataset.source_ref)
    return DatasetPreviewResponse(**preview)


@router.get("/datasets/candidates/{candidate_id}/preview", response_model=DatasetPreviewResponse)
def preview_candidate_dataset(candidate_id: str, db: Session = Depends(get_db)) -> DatasetPreviewResponse:
    try:
        preview = bi_service.preview_delta_source(db, table_id=candidate_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DatasetPreviewResponse(**preview)


@router.get("/charts", response_model=ChartListResponse)
def list_charts(db: Session = Depends(get_db)) -> ChartListResponse:
    items = db.query(Chart).order_by(Chart.updated_at.desc()).all()
    return ChartListResponse(items=items)


@router.post("/charts", response_model=ChartRead)
def create_chart(payload: ChartCreateRequest, db: Session = Depends(get_db)) -> ChartRead:
    record = Chart(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/charts/{chart_id}", response_model=ApiMessage)
def delete_chart(chart_id: str, db: Session = Depends(get_db)) -> ApiMessage:
    record = db.query(Chart).filter(Chart.id == chart_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Chart not found")
    db.delete(record)
    db.commit()
    return ApiMessage(message="Chart deleted successfully")


@router.post("/charts/preview", response_model=ChartPreviewResponse)
def preview_chart(payload: dict, db: Session = Depends(get_db)) -> ChartPreviewResponse:
    sql = payload.get("sql")
    if not sql:
        raise HTTPException(status_code=400, detail="SQL is required")
    preview = bi_service.preview_chart(db, sql, limit=int(payload.get("limit", 200)))
    return ChartPreviewResponse(**preview)


@router.get("/dashboards", response_model=DashboardListResponse)
def list_dashboards(db: Session = Depends(get_db)) -> DashboardListResponse:
    items = db.query(Dashboard).order_by(Dashboard.updated_at.desc()).all()
    return DashboardListResponse(items=items)


@router.post("/dashboards", response_model=DashboardDetailResponse)
def create_dashboard(payload: DashboardCreateRequest, db: Session = Depends(get_db)) -> DashboardDetailResponse:
    dashboard = Dashboard(
        name=bi_service.resolve_dashboard_name(db, payload.name),
        description=payload.description,
        layout_json=payload.layout_json,
        filters_json=payload.filters_json,
    )
    db.add(dashboard)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A dashboard with this name already exists. Please try again.") from exc
    db.refresh(dashboard)
    widgets = bi_service.replace_dashboard_widgets(db, dashboard, [item.model_dump() for item in payload.widgets])
    return DashboardDetailResponse(dashboard=dashboard, widgets=widgets)


@router.get("/dashboards/{dashboard_id}", response_model=DashboardDetailResponse)
def get_dashboard(dashboard_id: str, db: Session = Depends(get_db)) -> DashboardDetailResponse:
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).one_or_none()
    if dashboard is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    widgets = db.query(DashboardWidget).filter(DashboardWidget.dashboard_id == dashboard_id).order_by(DashboardWidget.created_at.asc()).all()
    return DashboardDetailResponse(dashboard=dashboard, widgets=widgets)


@router.post("/report-schedules", response_model=ReportScheduleRead)
def create_report_schedule(payload: ReportScheduleCreateRequest, db: Session = Depends(get_db)) -> ReportScheduleRead:
    data = payload.model_dump()
    data["name"] = bi_service.resolve_report_schedule_name(db, payload.name)
    record = ReportSchedule(**data)
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A report schedule with this name already exists. Please try again.") from exc
    db.refresh(record)
    return record


@router.get("/report-schedules", response_model=ReportScheduleListResponse)
def list_report_schedules(db: Session = Depends(get_db)) -> ReportScheduleListResponse:
    items = db.query(ReportSchedule).order_by(ReportSchedule.updated_at.desc()).all()
    return ReportScheduleListResponse(items=items)


@router.delete("/report-schedules/{schedule_id}", response_model=ApiMessage)
def delete_report_schedule(schedule_id: str, db: Session = Depends(get_db)) -> ApiMessage:
    record = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Report schedule not found")
    db.delete(record)
    db.commit()
    return ApiMessage(message="Report schedule deleted successfully")
