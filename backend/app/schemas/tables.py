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

    model_config = {"from_attributes": True, "populate_by_name": True}


class DeltaTableListResponse(BaseModel):
    items: list[DeltaTableRead]


class DeltaTablePreviewResponse(BaseModel):
    table: DeltaTableRead
    columns: list[str]
    rows: list[dict]
