from pydantic import BaseModel


class TableLineageUpstream(BaseModel):
    kind: str
    label: str
    pipeline_id: str | None = None
    pipeline_name: str | None = None
    node_id: str | None = None
    schedule_cron: str | None = None
    notebook_id: str | None = None
    notebook_name: str | None = None
    cell_id: str | None = None
    cell_title: str | None = None
    artifact_id: str | None = None
    engine_id: str | None = None
    source_query: str | None = None


class TableLineagePipeline(BaseModel):
    pipeline_id: str
    pipeline_name: str
    node_id: str | None = None
    schedule_cron: str | None = None
    updated_at: str


class TableLineageNotebookArtifact(BaseModel):
    artifact_id: str
    notebook_id: str
    cell_id: str
    cell_title: str | None = None
    artifact_kind: str
    display_name: str
    row_count: int | None = None
    created_at: str


class TableLineageSemanticDataset(BaseModel):
    dataset_id: str
    dataset_name: str
    metrics_count: int
    dimensions_count: int
    updated_at: str


class TableLineageChart(BaseModel):
    chart_id: str
    chart_name: str
    chart_type: str
    dataset_id: str | None = None
    updated_at: str


class TableLineageDashboard(BaseModel):
    dashboard_id: str
    dashboard_name: str
    dashboard_description: str | None = None
    updated_at: str


class TableLineageReportSchedule(BaseModel):
    schedule_id: str
    schedule_name: str
    dashboard_id: str | None = None
    frequency: str
    destination: str
    updated_at: str


class TableLineageCounts(BaseModel):
    semantic_datasets: int
    charts: int
    dashboards: int
    report_schedules: int
    related_pipelines: int
    notebook_artifacts: int


class TableLineageResponse(BaseModel):
    table_id: str
    table_name: str
    schema_name: str
    upstream: TableLineageUpstream
    related_pipelines: list[TableLineagePipeline]
    notebook_artifacts: list[TableLineageNotebookArtifact]
    semantic_datasets: list[TableLineageSemanticDataset]
    charts: list[TableLineageChart]
    dashboards: list[TableLineageDashboard]
    report_schedules: list[TableLineageReportSchedule]
    counts: TableLineageCounts
