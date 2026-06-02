from pydantic import BaseModel, Field


class EngineRead(BaseModel):
    id: str
    label: str
    vendor: str
    runtime_language: str
    available: bool
    status: str
    summary: str
    description: str
    availability_reason: str | None = None
    supports_sql: bool
    supports_python: bool
    supports_delta_read: bool
    supports_delta_write: bool
    supports_local_files: bool
    notebook_ready: bool
    sample_code: str


class EngineCatalogResponse(BaseModel):
    default_engine: str
    items: list[EngineRead]


class NotebookExecutionRequest(BaseModel):
    engine_id: str = Field(min_length=1)
    code: str = Field(min_length=1)
    limit: int = Field(default=200, ge=1, le=2000)


class NotebookExecutionResult(BaseModel):
    engine_id: str
    engine_label: str
    status: str
    language: str
    execution_ms: int
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    row_count: int = 0
    stdout: str | None = None
    message: str | None = None
    warnings: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class NotebookExecutionResponse(BaseModel):
    engine: EngineRead
    result: NotebookExecutionResult
