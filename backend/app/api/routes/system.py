from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.catalog import DeltaTable, UploadedFile
from app.models.pipeline import JobLog, PipelineRun
from app.schemas.system import DashboardMetricsResponse, RecentActivityItem, SettingsSnapshotResponse, SupersetHealthResponse
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


@router.get("/integrations/superset", response_model=SupersetHealthResponse)
def superset_integration_status() -> SupersetHealthResponse:
    checked_url = f"{settings.superset_url.rstrip('/')}/health"
    reachable = False
    http_status: int | None = None
    detail: str | None = None

    try:
        request = Request(checked_url, method="GET")
        with urlopen(request, timeout=2) as response:
            http_status = response.status
            reachable = 200 <= response.status < 400
            detail = "Superset health endpoint responded successfully."
    except HTTPError as exc:
        http_status = exc.code
        detail = f"Superset responded with HTTP {exc.code}."
    except URLError as exc:
        detail = f"Could not reach Superset at {checked_url}: {exc.reason}"
    except Exception as exc:  # noqa: BLE001
        detail = f"Unexpected Superset health check failure: {exc}"

    sample_connections = [
        {
            "label": "Local PostgreSQL Metadata",
            "purpose": "Quick demo path for browsing platform metadata and validating Superset connectivity.",
            "sqlalchemy_uri": "postgresql://postgres:postgres@localhost:5432/lakehouse",
        },
        {
            "label": "Docker Network PostgreSQL Metadata",
            "purpose": "Use this from inside the Superset container when creating a connection in the same Compose network.",
            "sqlalchemy_uri": "postgresql://postgres:postgres@postgres:5432/lakehouse",
        },
        {
            "label": "Future Curated Delta Query Path",
            "purpose": "Recommended storytelling path for a fuller lakehouse setup once Trino or DuckDB-serving is added.",
            "sqlalchemy_uri": "trino://trino@localhost:8080/lakehouse/analytics",
        },
    ]

    sample_datasets = [
        {
            "name": "sales_curated",
            "schema": "analytics",
            "description": "Primary demo-ready curated sales table for KPI cards, time-series revenue, and regional breakdowns.",
        },
        {
            "name": "customer_orders_curated",
            "schema": "analytics",
            "description": "Suggested follow-on curated dataset for customer-level segmentation demos.",
        },
    ]

    return SupersetHealthResponse(
        status="healthy" if reachable else "unreachable",
        reachable=reachable,
        checked_url=checked_url,
        http_status=http_status,
        detail=detail,
        login={
            "ui_url": settings.superset_url,
            "username": settings.superset_username,
            "password": settings.superset_password,
        },
        sample_connections=sample_connections,
        sample_datasets=sample_datasets,
        setup={
            "compose_command": "docker compose --profile superset up --build",
            "profile": "superset",
            "notes": [
                "Start the main DataWizz stack first so PostgreSQL and curated storage are available.",
                "Use the local PostgreSQL URI for quick connectivity demos from the host machine.",
                "For true curated Delta querying, position Trino or a DuckDB-serving layer in front of the curated zone later.",
            ],
        },
    )
