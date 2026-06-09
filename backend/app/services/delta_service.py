from datetime import datetime, timezone
from pathlib import Path

from deltalake import DeltaTable, write_deltalake
from pyarrow import Table
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.catalog import DeltaTable as DeltaTableModel
from app.services.catalog_metadata_service import CatalogMetadataService
from app.utils.naming import slugify_identifier


class DeltaService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.curated_dir = Path(self.settings.curated_storage_path)
        self.catalog_metadata_service = CatalogMetadataService()

    def table_path(self, table_name: str) -> Path:
        safe_name = slugify_identifier(table_name)
        return self.curated_dir / safe_name

    def write_table(
        self,
        db: Session,
        *,
        table_name: str,
        arrow_table: Table,
        mode: str,
        schema_name: str,
        description: str | None,
        source_query: str,
    ) -> DeltaTableModel:
        target_path = self.table_path(table_name)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        proposed_schema_json = [{"name": field.name, "type": str(field.type)} for field in arrow_table.schema]

        existing = db.query(DeltaTableModel).filter(DeltaTableModel.name == table_name).one_or_none()
        if existing is not None:
            contract_result = self.catalog_metadata_service.evaluate_contract(
                existing,
                proposed_schema_json=proposed_schema_json,
            )
            self.catalog_metadata_service.record_contract_check(existing, contract_result)
            if contract_result["status"] == "blocked":
                raise ValueError(contract_result["summary"])

        write_deltalake(str(target_path), arrow_table, mode=mode)
        delta = DeltaTable(str(target_path))
        materialized = delta.to_pyarrow_table()
        schema_json = [{"name": field.name, "type": str(field.type)} for field in materialized.schema]

        if existing is None:
            existing = DeltaTableModel(
                name=table_name,
                schema_name=schema_name,
                storage_path=str(target_path),
                description=description,
                schema_json=schema_json,
                mode=mode,
                source_query=source_query,
                row_count=materialized.num_rows,
                last_refreshed_at=datetime.now(timezone.utc),
            )
            db.add(existing)
        else:
            existing.schema_name = schema_name
            existing.storage_path = str(target_path)
            existing.description = description
            existing.schema_json = schema_json
            existing.mode = mode
            existing.source_query = source_query
            existing.row_count = materialized.num_rows
            existing.last_refreshed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        self.catalog_metadata_service.ensure_contract(existing)
        return existing

    def refresh_metadata(self, db: Session, table_record: DeltaTableModel) -> DeltaTableModel:
        delta = DeltaTable(table_record.storage_path)
        arrow_table = delta.to_pyarrow_table()
        table_record.schema_json = [{"name": field.name, "type": str(field.type)} for field in arrow_table.schema]
        table_record.row_count = arrow_table.num_rows
        table_record.last_refreshed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(table_record)
        return table_record
