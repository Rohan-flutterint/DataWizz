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
