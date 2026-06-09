from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel


class DeltaTableRead(TimestampedModel):
    name: str
    schema_name: str
    storage_path: str
    description: str | None = None
    schema_definition: list[dict] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    mode: str
    source_query: str | None = None
    row_count: int | None = None
    last_refreshed_at: datetime | None = None
    owner: str | None = None
    tags: list[str] | None = None
    freshness_status: str | None = None
    lineage_hint: str | None = None
    governance_score: int | None = None
    governance_grade: str | None = None
    governance_status: str | None = None
    governance_summary: str | None = None
    governance_strengths: list[str] | None = None
    governance_gaps: list[str] | None = None
    governance_breakdown: list[dict] | None = None
    contract_mode: str | None = None
    contract_version: int | None = None
    contract_schema_json: list[dict] | None = None
    contract_required_columns: list[str] | None = None
    contract_allow_additive_columns: bool | None = None
    contract_allow_column_removal: bool | None = None
    contract_allow_type_changes: bool | None = None
    contract_last_check_status: str | None = None
    contract_last_check_summary: str | None = None
    contract_last_check_issues: list[str] | None = None
    contract_last_check_at: datetime | None = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class DeltaTableListResponse(BaseModel):
    items: list[DeltaTableRead]


class DeltaTablePreviewResponse(BaseModel):
    table: DeltaTableRead
    columns: list[str]
    rows: list[dict]


class DeltaTableMetadataUpdateRequest(BaseModel):
    owner: str | None = None
    tags: list[str] | None = None
    lineage_hint: str | None = None


class DeltaTableContractUpdateRequest(BaseModel):
    contract_mode: str = Field(default="warn", pattern="^(off|warn|strict)$")
    contract_required_columns: list[str] | None = None
    contract_allow_additive_columns: bool = True
    contract_allow_column_removal: bool = False
    contract_allow_type_changes: bool = False
    adopt_current_schema: bool = False
