import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.bi import Chart, Dashboard, DashboardWidget, ReportSchedule, SemanticDataset
from app.models.catalog import DeltaTable, UploadedFile
from app.services.duckdb_service import DuckDBService


class BiService:
    def __init__(self) -> None:
        self.duckdb_service = DuckDBService()
        self.settings = get_settings()

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

    def list_dashboard_widgets(self, db: Session, dashboard_id: str) -> list[DashboardWidget]:
        return db.query(DashboardWidget).filter(DashboardWidget.dashboard_id == dashboard_id).order_by(DashboardWidget.created_at.asc()).all()

    def build_dashboard_export(self, db: Session, dashboard: Dashboard) -> dict:
        widgets = self.list_dashboard_widgets(db, dashboard.id)
        chart_ids = [widget.chart_id for widget in widgets if widget.chart_id]
        charts = (
            db.query(Chart).filter(Chart.id.in_(chart_ids)).all()
            if chart_ids
            else []
        )
        chart_map = {chart.id: chart for chart in charts}

        return {
            "version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "dashboard": {
                "name": dashboard.name,
                "description": dashboard.description,
                "layout_json": dashboard.layout_json or {},
                "filters_json": dashboard.filters_json or [],
            },
            "widgets": [
                {
                    "widget_type": widget.widget_type,
                    "title": widget.title,
                    "layout_json": widget.layout_json,
                    "config_json": widget.config_json or {},
                    "chart_source_id": widget.chart_id,
                }
                for widget in widgets
            ],
            "charts": [
                {
                    "source_chart_id": chart.id,
                    "name": chart.name,
                    "chart_type": chart.chart_type,
                    "dataset_id": chart.dataset_id if chart.dataset_id and db.query(SemanticDataset).filter(SemanticDataset.id == chart.dataset_id).one_or_none() else None,
                    "query_sql": chart.query_sql,
                    "config_json": chart.config_json or {},
                }
                for chart in charts
                if chart.id in chart_map
            ],
        }

    def import_dashboard_export(self, db: Session, payload: dict) -> tuple[Dashboard, list[DashboardWidget], list[Chart]]:
        config = payload["config"]
        imported_charts: list[Chart] = []
        chart_id_map: dict[str, str] = {}

        for chart_payload in config.get("charts", []):
            dataset_id = chart_payload.get("dataset_id")
            if dataset_id and db.query(SemanticDataset).filter(SemanticDataset.id == dataset_id).one_or_none() is None:
                dataset_id = None

            record = Chart(
                name=chart_payload["name"],
                chart_type=chart_payload["chart_type"],
                dataset_id=dataset_id,
                query_sql=chart_payload["query_sql"],
                config_json=chart_payload.get("config_json", {}),
            )
            db.add(record)
            db.flush()
            imported_charts.append(record)
            chart_id_map[str(chart_payload["source_chart_id"])] = record.id

        dashboard_payload = config["dashboard"]
        dashboard = Dashboard(
            name=self.resolve_dashboard_name(db, dashboard_payload["name"]),
            description=dashboard_payload.get("description"),
            layout_json=dashboard_payload.get("layout_json", {}),
            filters_json=dashboard_payload.get("filters_json"),
        )
        db.add(dashboard)
        db.commit()
        db.refresh(dashboard)

        widgets = self.replace_dashboard_widgets(
            db,
            dashboard,
            [
                {
                    "chart_id": chart_id_map.get(str(widget.get("chart_source_id"))) if widget.get("chart_source_id") else None,
                    "widget_type": widget["widget_type"],
                    "title": widget["title"],
                    "layout_json": widget.get("layout_json", {}),
                    "config_json": widget.get("config_json", {}),
                }
                for widget in config.get("widgets", [])
            ],
        )
        return dashboard, widgets, imported_charts

    def create_dashboard_snapshot_artifact(self, dashboard_name: str, requested_format: str, export_payload: dict) -> dict:
        exports_dir = Path(self.settings.temp_storage_path) / "dashboard_exports"
        exports_dir.mkdir(parents=True, exist_ok=True)
        safe_name = dashboard_name.strip().lower().replace(" ", "_") or "dashboard"
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        file_name = f"{safe_name}_{timestamp}.{requested_format}.mock.json"
        target = exports_dir / file_name
        target.write_text(
            json.dumps(
                {
                    "kind": "dashboard_snapshot_mock",
                    "requested_format": requested_format,
                    "dashboard_name": dashboard_name,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "note": "This is a demo snapshot manifest. A real renderer can later replace this with an actual PDF or PNG artifact.",
                    "dashboard_export": export_payload,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return {
            "artifact_path": str(target),
            "artifact_file_name": file_name,
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
