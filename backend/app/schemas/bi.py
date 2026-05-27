from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel


class CandidateDatasetRead(BaseModel):
    id: str
    name: str
    schema_name: str | None = None
    source_type: str
    source_ref: str
    description: str | None = None
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    row_count: int | None = None
    updated_at: str | None = None

    model_config = {"protected_namespaces": (), "populate_by_name": True}


class SemanticDatasetCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    source_type: str
    source_ref: str
    description: str | None = None
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    metrics_json: list[dict] | None = None
    dimensions_json: list[dict] | None = None

    model_config = {"protected_namespaces": (), "populate_by_name": True}


class SemanticDatasetUpdateRequest(BaseModel):
    name: str = Field(min_length=1)
    source_type: str
    source_ref: str
    description: str | None = None
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    metrics_json: list[dict] | None = None
    dimensions_json: list[dict] | None = None

    model_config = {"protected_namespaces": (), "populate_by_name": True}


class SemanticDatasetRead(TimestampedModel):
    name: str
    source_type: str
    source_ref: str
    description: str | None = None
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    metrics_json: list[dict] | None = None
    dimensions_json: list[dict] | None = None

    model_config = {"protected_namespaces": (), "from_attributes": True, "populate_by_name": True}


class ChartCreateRequest(BaseModel):
    name: str
    chart_type: str
    dataset_id: str | None = None
    query_sql: str
    config_json: dict = Field(default_factory=dict)


class ChartUpdateRequest(BaseModel):
    name: str
    chart_type: str
    dataset_id: str | None = None
    query_sql: str
    config_json: dict = Field(default_factory=dict)


class ChartRead(TimestampedModel):
    name: str
    chart_type: str
    dataset_id: str | None = None
    query_sql: str
    config_json: dict

    model_config = {"from_attributes": True}


class DashboardWidgetPayload(BaseModel):
    id: str | None = None
    chart_id: str | None = None
    widget_type: str
    title: str
    layout_json: dict
    config_json: dict = Field(default_factory=dict)


class DashboardCreateRequest(BaseModel):
    name: str
    description: str | None = None
    layout_json: dict = Field(default_factory=dict)
    filters_json: list[dict] | None = None
    widgets: list[DashboardWidgetPayload] = Field(default_factory=list)


class DashboardUpdateRequest(BaseModel):
    name: str
    description: str | None = None
    layout_json: dict = Field(default_factory=dict)
    filters_json: list[dict] | None = None
    widgets: list[DashboardWidgetPayload] = Field(default_factory=list)


class DashboardRead(TimestampedModel):
    name: str
    description: str | None = None
    layout_json: dict
    filters_json: list[dict] | None = None

    model_config = {"from_attributes": True}


class DashboardWidgetRead(TimestampedModel):
    dashboard_id: str
    chart_id: str | None = None
    widget_type: str
    title: str
    layout_json: dict
    config_json: dict

    model_config = {"from_attributes": True}


class DashboardDetailResponse(BaseModel):
    dashboard: DashboardRead
    widgets: list[DashboardWidgetRead]


class ReportScheduleCreateRequest(BaseModel):
    name: str
    dashboard_id: str | None = None
    frequency: str
    destination: str = "local_export"
    config_json: dict = Field(default_factory=dict)


class ReportScheduleRead(TimestampedModel):
    name: str
    dashboard_id: str | None = None
    frequency: str
    destination: str
    config_json: dict

    model_config = {"from_attributes": True}


class ReportScheduleListResponse(BaseModel):
    items: list[ReportScheduleRead]


class ChartPreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int


class DatasetPreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")

    model_config = {"protected_namespaces": (), "populate_by_name": True}


class DatasetExplorerResponse(BaseModel):
    items: list[SemanticDatasetRead]
    candidates: list[CandidateDatasetRead]


class ChartListResponse(BaseModel):
    items: list[ChartRead]


class DashboardListResponse(BaseModel):
    items: list[DashboardRead]
