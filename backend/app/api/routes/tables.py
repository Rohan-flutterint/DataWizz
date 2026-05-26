from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.catalog import DeltaTable
from app.schemas.tables import DeltaTableListResponse, DeltaTablePreviewResponse
from app.services.duckdb_service import DuckDBService


router = APIRouter(prefix="/tables", tags=["tables"])
duckdb_service = DuckDBService()


@router.get("", response_model=DeltaTableListResponse)
def list_tables(db: Session = Depends(get_db)) -> DeltaTableListResponse:
    items = db.query(DeltaTable).order_by(DeltaTable.updated_at.desc()).all()
    return DeltaTableListResponse(items=items)


@router.get("/{table_id}/preview", response_model=DeltaTablePreviewResponse)
def preview_table(table_id: str, db: Session = Depends(get_db)) -> DeltaTablePreviewResponse:
    table = db.query(DeltaTable).filter(DeltaTable.id == table_id).one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Delta table not found")
    preview = duckdb_service.preview_delta(table)
    return DeltaTablePreviewResponse(table=table, columns=preview["columns"], rows=preview["rows"])
