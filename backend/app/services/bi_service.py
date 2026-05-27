from sqlalchemy.orm import Session

from app.models.bi import Dashboard, DashboardWidget, ReportSchedule, SemanticDataset
from app.models.catalog import DeltaTable, UploadedFile
from app.services.duckdb_service import DuckDBService


class BiService:
    def __init__(self) -> None:
        self.duckdb_service = DuckDBService()

    def list_candidate_datasets(self, db: Session) -> list[dict]:
        datasets = []
        for table in db.query(DeltaTable).order_by(DeltaTable.updated_at.desc()).all():
            datasets.append(
                {
                    "id": table.id,
                    "name": table.name,
                    "schema_name": table.schema_name,
                    "source_type": "delta_table",
                    "source_ref": table.name,
                    "description": table.description,
                    "schema_json": table.schema_json,
                    "row_count": table.row_count,
                    "updated_at": table.updated_at.isoformat() if table.updated_at else None,
                }
            )
        return datasets

    def resolve_dataset_name(self, db: Session, desired_name: str, *, exclude_id: str | None = None) -> str:
        base_name = desired_name.strip() or "Untitled Dataset"
        candidate = base_name
        suffix = 2

        while True:
            query = db.query(SemanticDataset).filter(SemanticDataset.name == candidate)
            if exclude_id is not None:
                query = query.filter(SemanticDataset.id != exclude_id)
            if query.one_or_none() is None:
                return candidate
            candidate = f"{base_name} ({suffix})"
            suffix += 1

    def resolve_dashboard_name(self, db: Session, desired_name: str, *, exclude_id: str | None = None) -> str:
        base_name = desired_name.strip() or "Untitled Dashboard"
        candidate = base_name
        suffix = 2

        while True:
            query = db.query(Dashboard).filter(Dashboard.name == candidate)
            if exclude_id is not None:
                query = query.filter(Dashboard.id != exclude_id)
            if query.one_or_none() is None:
                return candidate
            candidate = f"{base_name} ({suffix})"
            suffix += 1

    def resolve_report_schedule_name(self, db: Session, desired_name: str) -> str:
        base_name = desired_name.strip() or "Untitled Report Schedule"
        candidate = base_name
        suffix = 2

        while db.query(ReportSchedule).filter(ReportSchedule.name == candidate).one_or_none() is not None:
            candidate = f"{base_name} ({suffix})"
            suffix += 1

        return candidate

    def preview_delta_source(self, db: Session, *, table_id: str | None = None, table_name: str | None = None, limit: int = 20) -> dict:
        query = db.query(DeltaTable)
        if table_id is not None:
            table = query.filter(DeltaTable.id == table_id).one_or_none()
        else:
            table = query.filter(DeltaTable.name == table_name).one_or_none()
        if table is None:
            raise ValueError("Delta table not found for dataset preview")

        preview = self.duckdb_service.preview_delta(table, limit=limit)
        return {
            "columns": preview["columns"],
            "rows": preview["rows"],
            "row_count": preview["row_count"],
            "schema_json": preview["schema"],
        }

    def preview_chart(self, db: Session, sql: str, limit: int = 200) -> dict:
        result = self.duckdb_service.execute_query(
            sql,
            uploaded_files=db.query(UploadedFile).all(),
            delta_tables=db.query(DeltaTable).all(),
            limit=limit,
        )
        return {
            "columns": result["columns"],
            "rows": result["rows"],
            "row_count": result["row_count"],
        }

    def replace_dashboard_widgets(self, db: Session, dashboard: Dashboard, widgets: list[dict]) -> list[DashboardWidget]:
        db.query(DashboardWidget).filter(DashboardWidget.dashboard_id == dashboard.id).delete()
        db.commit()
        created: list[DashboardWidget] = []
        for widget in widgets:
            record = DashboardWidget(
                dashboard_id=dashboard.id,
                chart_id=widget.get("chart_id"),
                widget_type=widget["widget_type"],
                title=widget["title"],
                layout_json=widget["layout_json"],
                config_json=widget.get("config_json", {}),
            )
            db.add(record)
            created.append(record)
        db.commit()
        for widget in created:
            db.refresh(widget)
        return created
