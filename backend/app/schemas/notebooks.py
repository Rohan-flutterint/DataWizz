from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel
from app.schemas.tables import DeltaTableRead


class NotebookCell(BaseModel):
    id: str = Field(min_length=1)
    title: str | None = None
    kind: str = Field(default="code", pattern="^(code|markdown)$")
    code: str = Field(min_length=1)


class NotebookDocumentCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    engine_id: str = Field(min_length=1)
    description: str | None = None
    cells_json: list[NotebookCell] = Field(default_factory=list)


class NotebookDocumentUpdateRequest(BaseModel):
    name: str = Field(min_length=1)
    engine_id: str = Field(min_length=1)
    description: str | None = None
    cells_json: list[NotebookCell] = Field(default_factory=list)


class NotebookCellExecutionResult(BaseModel):
    cell_id: str
    title: str | None = None
    status: str
    execution_ms: int
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    row_count: int = 0
    stdout: str | None = None
    message: str | None = None
    warnings: list[str] = Field(default_factory=list)


class NotebookDocumentRead(TimestampedModel):
    name: str
    engine_id: str
    description: str | None = None
    cells_json: list[NotebookCell]
    latest_cell_results_json: list[NotebookCellExecutionResult] = Field(default_factory=list)
    last_run_at: datetime | None = None


class NotebookRunRead(TimestampedModel):
    notebook_id: str
    engine_id: str
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    run_summary: dict | None = None


class NotebookRevisionRead(TimestampedModel):
    notebook_id: str
    version_number: int
    action: str
    snapshot_json: dict
    summary_json: dict | None = None


class NotebookArtifactRead(TimestampedModel):
    notebook_id: str
    notebook_run_id: str | None = None
    delta_table_id: str | None = None
    cell_id: str
    cell_title: str | None = None
    artifact_kind: str
    display_name: str
    storage_path: str
    download_name: str | None = None
    row_count: int | None = None
    metadata_json: dict | None = None


class NotebookSnippetCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    category: str = Field(default="general", min_length=1)
    engine_scope: str = Field(default="all", min_length=1)
    cell_kind: str = Field(default="code", pattern="^(code|markdown)$")
    code: str = Field(min_length=1)
    is_template: bool = False


class NotebookSnippetRead(TimestampedModel):
    name: str
    description: str | None = None
    category: str
    engine_scope: str
    cell_kind: str
    code: str
    is_template: bool


class NotebookListResponse(BaseModel):
    items: list[NotebookDocumentRead]


class NotebookDetailResponse(BaseModel):
    notebook: NotebookDocumentRead
    recent_revisions: list[NotebookRevisionRead]
    recent_runs: list[NotebookRunRead]
    recent_artifacts: list[NotebookArtifactRead]


class NotebookRunExecutionResponse(BaseModel):
    notebook: NotebookDocumentRead
    run: NotebookRunRead
    cell_results: list[NotebookCellExecutionResult]


class NotebookSnippetListResponse(BaseModel):
    items: list[NotebookSnippetRead]


class NotebookCellActionResponse(BaseModel):
    notebook: NotebookDocumentRead
    run: NotebookRunRead
    cell_results: list[NotebookCellExecutionResult]
    mode: str
    start_cell_id: str


class NotebookCellExportRequest(BaseModel):
    format: str = Field(pattern="^(csv|parquet)$")
    file_name: str | None = None


class NotebookCellWriteDeltaRequest(BaseModel):
    table_name: str = Field(min_length=1)
    mode: str = Field(default="overwrite", pattern="^(overwrite|append)$")
    schema_name: str = Field(default="analytics", min_length=1)
    description: str | None = None


class NotebookCellWriteDeltaResponse(BaseModel):
    message: str
    table: DeltaTableRead


class NotebookRevisionRestoreResponse(BaseModel):
    notebook: NotebookDocumentRead
    revision: NotebookRevisionRead
    message: str
