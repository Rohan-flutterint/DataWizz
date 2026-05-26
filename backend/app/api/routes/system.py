from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.catalog import DeltaTable, UploadedFile
from app.models.pipeline import JobLog, PipelineRun
from app.schemas.system import DashboardMetricsResponse, RecentActivityItem, SettingsSnapshotResponse
from app.services.storage import StorageService


router = APIRouter(prefix="/system", tags=["system"])
settings = get_settings()
storage_service = StorageService()


@router.get("/dashboard-metrics", response_model=DashboardMetricsResponse)
def dashboard_metrics(db: Session = Depends(get_db)) -> DashboardMetricsResponse:
    recent_activity: list[RecentActivityItem] = []
    recent_files = db.query(UploadedFile).order_by(desc(UploadedFile.created_at)).limit(3).all()
    recent_runs = db.query(PipelineRun).order_by(desc(PipelineRun.created_at)).limit(3).all()
    recent_logs = db.query(JobLog).order_by(desc(JobLog.created_at)).limit(3).all()

    for item in recent_files:
        recent_activity.append(RecentActivityItem(id=item.id, kind="file", title=item.name, status="uploaded", created_at=item.created_at.isoformat()))
    for item in recent_runs:
        recent_activity.append(RecentActivityItem(id=item.id, kind="pipeline_run", title=item.pipeline_id, status=item.status, created_at=item.created_at.isoformat()))
    for item in recent_logs:
        recent_activity.append(RecentActivityItem(id=item.id, kind="log", title=item.source, status=item.status or "info", created_at=item.created_at.isoformat()))

    recent_activity = sorted(recent_activity, key=lambda item: item.created_at, reverse=True)[:8]

    return DashboardMetricsResponse(
        total_files=db.query(UploadedFile).count(),
        total_delta_tables=db.query(DeltaTable).count(),
        total_pipeline_runs=db.query(PipelineRun).count(),
        failed_jobs=db.query(PipelineRun).filter(PipelineRun.status == "failed").count(),
        storage_usage_bytes=storage_service.get_storage_usage_bytes(),
        recent_activity=recent_activity,
    )


@router.get("/settings", response_model=SettingsSnapshotResponse)
def settings_snapshot() -> SettingsSnapshotResponse:
    return SettingsSnapshotResponse(
        storage={
            "raw": settings.raw_storage_path,
            "curated": settings.curated_storage_path,
            "temp": settings.temp_storage_path,
            "minio_endpoint": settings.minio_endpoint,
            "minio_bucket": settings.minio_bucket,
        },
        execution={"engine": settings.execution_engine, "query_preview_limit": settings.query_preview_limit},
    )
