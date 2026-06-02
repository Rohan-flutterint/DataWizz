from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel


class PipelineNode(BaseModel):
    id: str
    type: str
    position: dict[str, float]
    data: dict = Field(default_factory=dict)


class PipelineEdge(BaseModel):
    id: str
    source: str
    target: str


class PipelineDefinition(BaseModel):
    nodes: list[PipelineNode]
    edges: list[PipelineEdge]


class PipelineCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    status: str = "draft"
    schedule_cron: str | None = None
    definition: PipelineDefinition


class PipelineUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: str | None = None
    schedule_cron: str | None = None
    definition: PipelineDefinition


class PipelineRead(TimestampedModel):
    name: str
    description: str | None = None
    status: str
    schedule_cron: str | None = None
    definition_json: dict


class PipelineListResponse(BaseModel):
    items: list[PipelineRead]


class PipelineRunRead(TimestampedModel):
    pipeline_id: str
    pipeline_name: str | None = None
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    trigger_type: str
    error_message: str | None = None
    run_summary: dict | None = None


class JobLogRead(TimestampedModel):
    pipeline_run_id: str | None = None
    query_id: str | None = None
    level: str
    source: str
    message: str
    status: str | None = None
    context_json: dict | None = None


class PipelineRunResponse(BaseModel):
    run: PipelineRunRead
    logs: list[JobLogRead]


class PipelineRunDetailResponse(BaseModel):
    run: PipelineRunRead
    pipeline: PipelineRead | None = None
    logs: list[JobLogRead]


class PipelineRunListResponse(BaseModel):
    items: list[PipelineRunRead]


class JobLogListResponse(BaseModel):
    items: list[JobLogRead]


class PipelineValidationResponse(BaseModel):
    valid: bool
    message: str
    ordered_nodes: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)


class AirflowDagResponse(BaseModel):
    pipeline_id: str
    code: str


class SchedulerSweepResponse(BaseModel):
    checked: int
    triggered: list[dict] = Field(default_factory=list)
    invalid_schedules: list[dict] = Field(default_factory=list)
    next_due: list[dict] = Field(default_factory=list)


class SchedulerStatusResponse(BaseModel):
    enabled: bool
    running: bool
    timezone: str
    poll_interval_seconds: int
    last_tick_at: str | None = None
    last_error: str | None = None
    managed_pipeline_count: int
    last_summary: SchedulerSweepResponse
