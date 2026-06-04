from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.catalog import DeltaTable
from app.schemas.table_lineage import TableLineageResponse
from app.schemas.tables import DeltaTableListResponse, DeltaTableMetadataUpdateRequest, DeltaTablePreviewResponse, DeltaTableRead
from app.services.catalog_lineage_service import catalog_lineage_service
from app.services.catalog_metadata_service import CatalogMetadataService
from app.services.delta_service import DeltaService
from app.services.duckdb_service import DuckDBService


router = APIRouter(prefix="/tables", tags=["tables"])
duckdb_service = DuckDBService()
delta_service = DeltaService()
catalog_metadata_service = CatalogMetadataService()


@router.get("", response_model=DeltaTableListResponse)
def list_tables(db: Session = Depends(get_db)) -> DeltaTableListResponse:
    items = db.query(DeltaTable).order_by(DeltaTable.updated_at.desc()).all()
    return DeltaTableListResponse(items=[DeltaTableRead.model_validate(catalog_metadata_service.enrich_table(item)) for item in items])


@router.get("/{table_id}/preview", response_model=DeltaTablePreviewResponse)
def preview_table(table_id: str, db: Session = Depends(get_db)) -> DeltaTablePreviewResponse:
    table = db.query(DeltaTable).filter(DeltaTable.id == table_id).one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Delta table not found")
    preview = duckdb_service.preview_delta(table)
    enriched = DeltaTableRead.model_validate(catalog_metadata_service.enrich_table(table))
    return DeltaTablePreviewResponse(table=enriched, columns=preview["columns"], rows=preview["rows"])


@router.get("/{table_id}/lineage", response_model=TableLineageResponse)
def get_table_lineage(table_id: str, db: Session = Depends(get_db)) -> TableLineageResponse:
    table = db.query(DeltaTable).filter(DeltaTable.id == table_id).one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Delta table not found")
    return TableLineageResponse.model_validate(catalog_lineage_service.build_table_lineage(db, table))


@router.put("/{table_id}/metadata", response_model=DeltaTableRead, dependencies=[Depends(require_roles("admin", "analyst"))])
def update_table_metadata(table_id: str, payload: DeltaTableMetadataUpdateRequest, db: Session = Depends(get_db)) -> DeltaTableRead:
    table = db.query(DeltaTable).filter(DeltaTable.id == table_id).one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Delta table not found")
    enriched = catalog_metadata_service.update_metadata(table, owner=payload.owner, tags=payload.tags, lineage_hint=payload.lineage_hint)
    return DeltaTableRead.model_validate(enriched)


@router.post("/{table_id}/refresh", response_model=DeltaTableRead, dependencies=[Depends(require_roles("admin", "analyst"))])
def refresh_table_metadata(table_id: str, db: Session = Depends(get_db)) -> DeltaTableRead:
    table = db.query(DeltaTable).filter(DeltaTable.id == table_id).one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Delta table not found")
    refreshed = delta_service.refresh_metadata(db, table)
    enriched = catalog_metadata_service.refresh_freshness(refreshed)
    return DeltaTableRead.model_validate(enriched)
