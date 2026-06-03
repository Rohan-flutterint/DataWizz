from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.dependencies import require_roles
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.catalog import UploadedFile
from app.schemas.files import FileDeleteResponse, FileListResponse, FilePreviewResponse, FileUploadResponse, UploadedFileRead
from app.services.duckdb_service import DuckDBService
from app.services.storage import StorageService
from app.utils.tabular import detect_file_type


router = APIRouter(prefix="/files", tags=["files"])
storage_service = StorageService()
duckdb_service = DuckDBService()


@router.get("", response_model=FileListResponse)
def list_files(db: Session = Depends(get_db)) -> FileListResponse:
    items = db.query(UploadedFile).order_by(UploadedFile.created_at.desc()).all()
    return FileListResponse(items=items)


@router.post("/upload", response_model=FileUploadResponse, dependencies=[Depends(require_roles("admin", "analyst"))])
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)) -> FileUploadResponse:
    try:
        file_type = detect_file_type(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target_path, size_bytes = storage_service.save_upload(file)
    record = UploadedFile(
        name=target_path.name,
        storage_path=str(target_path),
        file_type=file_type,
        size_bytes=size_bytes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    preview = duckdb_service.preview_file(record, limit=20)
    record.schema_json = preview["schema"]
    record.row_count = preview["row_count"]
    db.commit()
    db.refresh(record)

    return FileUploadResponse(file=record)


@router.get("/{file_id}/preview", response_model=FilePreviewResponse)
def preview_file(file_id: str, db: Session = Depends(get_db)) -> FilePreviewResponse:
    record = db.query(UploadedFile).filter(UploadedFile.id == file_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")
    preview = duckdb_service.preview_file(record, limit=20)
    record.schema_json = preview["schema"]
    record.row_count = preview["row_count"]
    db.commit()
    db.refresh(record)
    return FilePreviewResponse(file=record, columns=preview["columns"], rows=preview["rows"])


@router.delete("/{file_id}", response_model=FileDeleteResponse, dependencies=[Depends(require_roles("admin", "analyst"))])
def delete_file(file_id: str, db: Session = Depends(get_db)) -> FileDeleteResponse:
    record = db.query(UploadedFile).filter(UploadedFile.id == file_id).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")
    storage_service.delete_path(record.storage_path)
    db.delete(record)
    db.commit()
    return FileDeleteResponse(message="File deleted successfully")
