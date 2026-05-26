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


class FilePreviewResponse(BaseModel):
    file: UploadedFileRead
    columns: list[str]
    rows: list[dict]


class FileListResponse(BaseModel):
    items: list[UploadedFileRead]


class FileUploadResponse(BaseModel):
    file: UploadedFileRead
    message: str = "File uploaded successfully"


class FileDeleteResponse(BaseModel):
    message: str


class FilePreviewParams(BaseModel):
    limit: int = Field(default=20, ge=1, le=500)
