from pydantic import BaseModel, Field

from app.schemas.common import TimestampedModel


class FileSchemaField(BaseModel):
    name: str
    type: str


class UploadedFileRead(TimestampedModel):
    name: str
    storage_path: str
    file_type: str
    size_bytes: int
    schema_definition: list[FileSchemaField] | None = Field(default=None, alias="schema_json", serialization_alias="schema_json")
    row_count: int | None = None
    source: str

    model_config = {"from_attributes": True, "populate_by_name": True}


class FileRecommendationItem(BaseModel):
    column: str
    label: str
    confidence: str
    reasons: list[str]


class FileRecommendations(BaseModel):
    join_keys: list[FileRecommendationItem]
    dimensions: list[FileRecommendationItem]
    metrics: list[FileRecommendationItem]
    time_columns: list[FileRecommendationItem]
    quality_actions: list[str]


class FilePreviewResponse(BaseModel):
    file: UploadedFileRead
    columns: list[str]
    rows: list[dict]
    profile_summary: dict
    column_profiles: list[dict]
    recommendations: FileRecommendations


class FileListResponse(BaseModel):
    items: list[UploadedFileRead]


class FileUploadResponse(BaseModel):
    file: UploadedFileRead
    message: str = "File uploaded successfully"


class FileDeleteResponse(BaseModel):
    message: str


class FilePreviewParams(BaseModel):
    limit: int = Field(default=20, ge=1, le=500)
