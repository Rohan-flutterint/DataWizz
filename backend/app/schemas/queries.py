from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel
from app.schemas.tables import DeltaTableRead


class QueryExecuteRequest(BaseModel):
    sql: str = Field(min_length=1)
    name: str | None = None
    limit: int | None = Field(default=200, ge=1, le=5000)


class QueryExportRequest(BaseModel):
    sql: str = Field(min_length=1)
    format: str = Field(pattern="^(csv|parquet)$")
    file_name: str | None = None


class WriteDeltaRequest(BaseModel):
    table_name: str = Field(min_length=1)
    sql: str = Field(min_length=1)
    mode: str = Field(default="overwrite", pattern="^(overwrite|append)$")
    schema_name: str = "analytics"
    description: str | None = None


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[dict]
    row_count: int
    execution_ms: int


class QueryHistoryRead(TimestampedModel):
    name: str | None = None
    sql_text: str
    status: str
    execution_ms: int | None = None
    row_count: int | None = None
    result_preview: list[dict] | None = None
    error_message: str | None = None


class QueryExecuteResponse(BaseModel):
    query: QueryHistoryRead
    result: QueryResult


class QueryHistoryListResponse(BaseModel):
    items: list[QueryHistoryRead]


class WriteDeltaResponse(BaseModel):
    message: str
    table: DeltaTableRead
