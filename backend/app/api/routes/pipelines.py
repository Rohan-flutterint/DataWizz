from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.catalog import DeltaTable, UploadedFile
from app.models.pipeline import JobLog, Pipeline, PipelineRun
from app.schemas.pipelines import (
    AirflowDagResponse,
    JobLogListResponse,
    PipelineCreateRequest,
    PipelineRunDetailResponse,
    PipelineListResponse,
    PipelineRead,
    PipelineRunListResponse,
    PipelineRunRead,
    PipelineRunResponse,
    PipelineUpdateRequest,
    PipelineValidationResponse,
    SchedulerStatusResponse,
    SchedulerSweepResponse,
)
from app.services.airflow_dag import AirflowDagService
from app.services.pipeline_service import PipelineService
from app.services.pipeline_scheduler_service import pipeline_scheduler_service


router = APIRouter(prefix="/pipelines", tags=["pipelines"])
pipeline_service = PipelineService()
airflow_dag_service = AirflowDagService()


def _resolve_pipeline_name(db: Session, desired_name: str, *, exclude_id: str | None = None) -> str:
    base_name = desired_name.strip() or "Untitled Pipeline"
    candidate = base_name
    suffix = 2

    while True:
        query = db.query(Pipeline).filter(Pipeline.name == candidate)
        if exclude_id is not None:
            query = query.filter(Pipeline.id != exclude_id)
        if query.one_or_none() is None:
            return candidate
        candidate = f"{base_name} ({suffix})"
        suffix += 1


@router.get("", response_model=PipelineListResponse)
def list_pipelines(db: Session = Depends(get_db)) -> PipelineListResponse:
    items = db.query(Pipeline).order_by(Pipeline.updated_at.desc()).all()
    return PipelineListResponse(items=items)


def _to_pipeline_run_read(run: PipelineRun, db: Session) -> PipelineRunRead:
    pipeline = db.query(Pipeline).filter(Pipeline.id == run.pipeline_id).one_or_none()
    payload = PipelineRunRead.model_validate(run)
    payload.pipeline_name = pipeline.name if pipeline is not None else None
    return payload


@router.post("", response_model=PipelineRead)
def create_pipeline(payload: PipelineCreateRequest, db: Session = Depends(get_db)) -> PipelineRead:
    record = Pipeline(
        name=_resolve_pipeline_name(db, payload.name),
        description=payload.description,
        definition_json=payload.definition.model_dump(),
        schedule_cron=payload.schedule_cron,
        status=payload.status,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A pipeline with this name already exists. Please try saving again.") from exc
    db.refresh(record)
    return record


@router.get("/{pipeline_id}", response_model=PipelineRead)
def get_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> PipelineRead:
    record = db.query(Pipeline).filter(Pipeline.id == pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return record


@router.put("/{pipeline_id}", response_model=PipelineRead)
def update_pipeline(pipeline_id: str, payload: PipelineUpdateRequest, db: Session = Depends(get_db)) -> PipelineRead:
    record = db.query(Pipeline).filter(Pipeline.id == pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if payload.name is not None:
        record.name = _resolve_pipeline_name(db, payload.name, exclude_id=pipeline_id)
    record.description = payload.description
    record.status = payload.status or record.status
    record.schedule_cron = payload.schedule_cron
    record.definition_json = payload.definition.model_dump()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A pipeline with this name already exists. Please choose a different name.") from exc
    db.refresh(record)
    return record


@router.post("/{pipeline_id}/validate", response_model=PipelineValidationResponse)
def validate_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> PipelineValidationResponse:
    record = db.query(Pipeline).filter(Pipeline.id == pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    uploaded_files = {item.id: item for item in db.query(UploadedFile).all()}
    delta_tables = {item.id: item for item in db.query(DeltaTable).all()}
    valid, ordered_nodes, issues = pipeline_service.validate_definition(
        record.definition_json,
        uploaded_files=uploaded_files,
        delta_tables=delta_tables,
    )
    message = "Pipeline is valid" if valid else "Pipeline has validation issues"
    return PipelineValidationResponse(valid=valid, message=message, ordered_nodes=ordered_nodes, issues=issues)


@router.post("/{pipeline_id}/run", response_model=PipelineRunResponse)
def run_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> PipelineRunResponse:
    record = db.query(Pipeline).filter(Pipeline.id == pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    run = pipeline_service.execute_pipeline(db, record)
    logs = db.query(JobLog).filter(JobLog.pipeline_run_id == run.id).order_by(JobLog.created_at.asc()).all()
    return PipelineRunResponse(run=_to_pipeline_run_read(run, db), logs=logs)


@router.post("/runs/{run_id}/retry", response_model=PipelineRunResponse)
def retry_run(run_id: str, db: Session = Depends(get_db)) -> PipelineRunResponse:
    previous_run = db.query(PipelineRun).filter(PipelineRun.id == run_id).one_or_none()
    if previous_run is None:
        raise HTTPException(status_code=404, detail="Pipeline run not found")

    record = db.query(Pipeline).filter(Pipeline.id == previous_run.pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found for this run")

    run = pipeline_service.execute_pipeline(db, record, trigger_type="retry", retry_of_run_id=previous_run.id)
    logs = db.query(JobLog).filter(JobLog.pipeline_run_id == run.id).order_by(JobLog.created_at.asc()).all()
    return PipelineRunResponse(run=_to_pipeline_run_read(run, db), logs=logs)


@router.get("/scheduler/status", response_model=SchedulerStatusResponse)
def get_scheduler_status() -> SchedulerStatusResponse:
    return SchedulerStatusResponse.model_validate(pipeline_scheduler_service.get_status())


@router.post("/scheduler/run-due", response_model=SchedulerSweepResponse)
def run_due_schedules() -> SchedulerSweepResponse:
    return SchedulerSweepResponse.model_validate(pipeline_scheduler_service.run_due_pipelines_once())


@router.get("/runs/all", response_model=PipelineRunListResponse)
def list_runs(db: Session = Depends(get_db)) -> PipelineRunListResponse:
    items = db.query(PipelineRun).order_by(PipelineRun.created_at.desc()).limit(100).all()
    return PipelineRunListResponse(items=[_to_pipeline_run_read(item, db) for item in items])


@router.get("/runs/{run_id}", response_model=PipelineRunDetailResponse)
def get_run_details(run_id: str, db: Session = Depends(get_db)) -> PipelineRunDetailResponse:
    run = db.query(PipelineRun).filter(PipelineRun.id == run_id).one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Pipeline run not found")

    pipeline = db.query(Pipeline).filter(Pipeline.id == run.pipeline_id).one_or_none()
    logs = db.query(JobLog).filter(JobLog.pipeline_run_id == run.id).order_by(JobLog.created_at.asc()).all()
    return PipelineRunDetailResponse(run=_to_pipeline_run_read(run, db), pipeline=pipeline, logs=logs)


@router.get("/logs/all", response_model=JobLogListResponse)
def list_logs(
    db: Session = Depends(get_db),
    run_id: str | None = Query(default=None),
    node_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> JobLogListResponse:
    query = db.query(JobLog)
    if run_id:
        query = query.filter(JobLog.pipeline_run_id == run_id)
    if status:
        normalized = status.strip().lower()
        query = query.filter(JobLog.status.is_not(None)).filter(JobLog.status.ilike(normalized))

    items = query.order_by(JobLog.created_at.desc()).limit(400).all()
    if node_id:
        needle = node_id.strip()
        items = [
            item
            for item in items
            if isinstance(item.context_json, dict) and str(item.context_json.get("node_id") or "").strip() == needle
        ]
    return JobLogListResponse(items=items)


@router.get("/{pipeline_id}/airflow-dag", response_model=AirflowDagResponse)
def generate_airflow_dag(pipeline_id: str, db: Session = Depends(get_db)) -> AirflowDagResponse:
    record = db.query(Pipeline).filter(Pipeline.id == pipeline_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return AirflowDagResponse(pipeline_id=pipeline_id, code=airflow_dag_service.generate(record))
