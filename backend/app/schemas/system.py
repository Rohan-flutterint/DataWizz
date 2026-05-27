from pydantic import BaseModel


class RecentActivityItem(BaseModel):
    id: str
    kind: str
    title: str
    status: str
    created_at: str


class DashboardMetricsResponse(BaseModel):
    total_files: int
    total_delta_tables: int
    total_pipeline_runs: int
    failed_jobs: int
    storage_usage_bytes: int
    recent_activity: list[RecentActivityItem]


class SettingsSnapshotResponse(BaseModel):
    storage: dict
    execution: dict


class SupersetHealthResponse(BaseModel):
    status: str
    reachable: bool
    checked_url: str
    http_status: int | None = None
    detail: str | None = None
    login: dict
    sample_connections: list[dict]
    sample_datasets: list[dict]
    setup: dict
