import json
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from html import escape
from pathlib import Path

import pyarrow.csv as pacsv
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.bi import Chart, Dashboard, DashboardWidget, ReportSchedule, ReportSnapshot, SemanticDataset
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

    def list_report_snapshots(self, db: Session, schedule_id: str | None = None) -> list[ReportSnapshot]:
        query = db.query(ReportSnapshot)
        if schedule_id is not None:
            query = query.filter(ReportSnapshot.schedule_id == schedule_id)
        return query.order_by(ReportSnapshot.created_at.desc()).all()

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

    def get_chart_traceability(self, db: Session, chart_id: str) -> dict:
        chart = db.query(Chart).filter(Chart.id == chart_id).one_or_none()
        if chart is None:
            raise ValueError("Chart not found")

        widgets = db.query(DashboardWidget).filter(DashboardWidget.chart_id == chart_id).order_by(DashboardWidget.created_at.asc()).all()
        dashboards = []
        dashboard_ids: list[str] = []
        for widget in widgets:
            dashboard = db.query(Dashboard).filter(Dashboard.id == widget.dashboard_id).one_or_none()
            if dashboard is None:
                continue
            dashboard_ids.append(dashboard.id)
            dashboards.append(
                {
                    "dashboard_id": dashboard.id,
                    "dashboard_name": dashboard.name,
                    "dashboard_description": dashboard.description,
                    "widget_id": widget.id,
                    "widget_title": widget.title,
                    "widget_type": widget.widget_type,
                    "updated_at": dashboard.updated_at.isoformat(),
                }
            )

        unique_dashboard_ids = list(dict.fromkeys(dashboard_ids))
        schedules = []
        if unique_dashboard_ids:
            for schedule in (
                db.query(ReportSchedule)
                .filter(ReportSchedule.dashboard_id.in_(unique_dashboard_ids))
                .order_by(ReportSchedule.updated_at.desc())
                .all()
            ):
                dashboard = next((item for item in dashboards if item["dashboard_id"] == schedule.dashboard_id), None)
                schedules.append(
                    {
                        "schedule_id": schedule.id,
                        "schedule_name": schedule.name,
                        "dashboard_id": schedule.dashboard_id,
                        "dashboard_name": dashboard["dashboard_name"] if dashboard else None,
                        "frequency": schedule.frequency,
                        "destination": schedule.destination,
                        "updated_at": schedule.updated_at.isoformat(),
                    }
                )

        return {
            "chart": chart,
            "widget_count": len(widgets),
            "dashboard_count": len(unique_dashboard_ids),
            "report_schedule_count": len(schedules),
            "dashboards": dashboards,
            "report_schedules": schedules,
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

    def execute_report_schedule(self, db: Session, schedule: ReportSchedule) -> ReportSnapshot:
        requested_format = str(schedule.config_json.get("format", "pdf"))
        dashboard = db.query(Dashboard).filter(Dashboard.id == schedule.dashboard_id).one_or_none() if schedule.dashboard_id else None
        snapshot = ReportSnapshot(
            schedule_id=schedule.id,
            dashboard_id=schedule.dashboard_id,
            schedule_name=schedule.name,
            dashboard_name=dashboard.name if dashboard else None,
            requested_format=requested_format,
            destination=schedule.destination,
            status="running",
            started_at=datetime.now(timezone.utc),
            summary_json={"delivery_note": schedule.config_json.get("deliveryNote")},
        )
        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)

        try:
            if dashboard is None:
                raise ValueError("The linked dashboard could not be found for this schedule.")

            export_payload = self.build_dashboard_export(db, dashboard)
            artifact = self._generate_report_schedule_artifact(
                db=db,
                schedule=schedule,
                dashboard=dashboard,
                snapshot=snapshot,
                requested_format=requested_format,
                export_payload=export_payload,
            )
            finished_at = datetime.now(timezone.utc)
            snapshot.status = "success"
            snapshot.finished_at = finished_at
            snapshot.artifact_path = artifact["artifact_path"]
            snapshot.artifact_file_name = artifact["artifact_file_name"]
            snapshot.artifact_kind = artifact["artifact_kind"]
            snapshot.summary_json = {
                "delivery_note": schedule.config_json.get("deliveryNote"),
                "requested_format": requested_format,
                "artifact_kind": artifact["artifact_kind"],
                "chart_exports": artifact.get("chart_exports", []),
            }
            schedule.config_json = {
                **schedule.config_json,
                "lastRunAt": finished_at.isoformat(),
                "lastRunStatus": "success",
                "lastSnapshotId": snapshot.id,
                "lastArtifactPath": artifact["artifact_path"],
            }
            db.commit()
            db.refresh(snapshot)
            db.refresh(schedule)
            return snapshot
        except Exception as exc:
            finished_at = datetime.now(timezone.utc)
            snapshot.status = "failed"
            snapshot.finished_at = finished_at
            snapshot.error_message = str(exc)
            snapshot.summary_json = {
                "delivery_note": schedule.config_json.get("deliveryNote"),
                "requested_format": requested_format,
            }
            schedule.config_json = {
                **schedule.config_json,
                "lastRunAt": finished_at.isoformat(),
                "lastRunStatus": "failed",
                "lastError": str(exc),
                "lastSnapshotId": snapshot.id,
            }
            db.commit()
            db.refresh(snapshot)
            db.refresh(schedule)
            return snapshot

    def _generate_report_schedule_artifact(
        self,
        db: Session,
        schedule: ReportSchedule,
        dashboard: Dashboard,
        snapshot: ReportSnapshot,
        requested_format: str,
        export_payload: dict,
    ) -> dict:
        base_dir = Path(self.settings.temp_storage_path) / "report_snapshots"
        base_dir.mkdir(parents=True, exist_ok=True)
        safe_name = schedule.name.strip().lower().replace(" ", "_") or "report_schedule"
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_dir = base_dir / f"{safe_name}_{timestamp}"
        run_dir.mkdir(parents=True, exist_ok=True)

        chart_exports = []
        for chart_payload in export_payload.get("charts", []):
            result = self.duckdb_service.execute_query(
                chart_payload["query_sql"],
                uploaded_files=db.query(UploadedFile).all(),
                delta_tables=db.query(DeltaTable).all(),
                limit=None,
            )
            chart_exports.append(
                {
                    "chart_name": chart_payload["name"],
                    "chart_type": chart_payload["chart_type"],
                    "columns": result["columns"],
                    "rows": result["rows"],
                    "arrow_table": result["arrow_table"],
                }
            )

        (run_dir / "dashboard_export.json").write_text(json.dumps(export_payload, indent=2), encoding="utf-8")

        if requested_format in {"csv", "excel"}:
            bundle_name = f"{safe_name}_{timestamp}.{requested_format}_bundle.zip"
            bundle_path = run_dir / bundle_name
            with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dashboard_export.json", json.dumps(export_payload, indent=2))
                archive.writestr(
                    "manifest.json",
                    json.dumps(
                        {
                            "schedule_name": schedule.name,
                            "dashboard_name": dashboard.name,
                            "requested_format": requested_format,
                            "generated_at": datetime.now(timezone.utc).isoformat(),
                            "note": "Excel exports are delivered as a zipped CSV bundle in this MVP build.",
                        },
                        indent=2,
                    ),
                )
                for index, chart_export in enumerate(chart_exports, start=1):
                    output = BytesIO()
                    pacsv.write_csv(chart_export["arrow_table"], output)
                    output.seek(0)
                    chart_slug = chart_export["chart_name"].strip().lower().replace(" ", "_") or f"chart_{index}"
                    archive.writestr(f"{index:02d}_{chart_slug}.csv", output.read())
            return {
                "artifact_path": str(bundle_path),
                "artifact_file_name": bundle_name,
                "artifact_kind": "zip_csv_bundle",
                "chart_exports": [{"chart_name": item["chart_name"], "row_count": len(item["rows"])} for item in chart_exports],
            }

        html_name = f"{safe_name}_{timestamp}.{requested_format}_report.html"
        html_path = run_dir / html_name
        html_path.write_text(self._build_html_report(schedule, dashboard, snapshot, export_payload, chart_exports, requested_format), encoding="utf-8")
        return {
            "artifact_path": str(html_path),
            "artifact_file_name": html_name,
            "artifact_kind": "html_report",
            "chart_exports": [{"chart_name": item["chart_name"], "row_count": len(item["rows"])} for item in chart_exports],
        }

    def _build_html_report(
        self,
        schedule: ReportSchedule,
        dashboard: Dashboard,
        snapshot: ReportSnapshot,
        export_payload: dict,
        chart_exports: list[dict],
        requested_format: str,
    ) -> str:
        sections = []
        for chart_export in chart_exports:
            headers = "".join(f"<th>{escape(str(column))}</th>" for column in chart_export["columns"])
            rows = "".join(
                "<tr>" + "".join(f"<td>{escape(str(value))}</td>" for value in row.values()) + "</tr>"
                for row in chart_export["rows"][:50]
            )
            sections.append(
                f"""
                <section style="margin-top:32px;">
                  <h2 style="font-size:20px;margin-bottom:8px;">{escape(chart_export['chart_name'])}</h2>
                  <p style="color:#475569;font-size:14px;">{escape(chart_export['chart_type'])} • {len(chart_export['rows'])} rows exported</p>
                  <div style="overflow:auto;border:1px solid #e2e8f0;border-radius:12px;margin-top:12px;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                      <thead style="background:#f8fafc;"><tr>{headers}</tr></thead>
                      <tbody>{rows}</tbody>
                    </table>
                  </div>
                </section>
                """
            )

        return f"""
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>{escape(schedule.name)} export</title>
          </head>
          <body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px;">
            <div style="max-width:1200px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:24px;padding:32px;">
              <p style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;">Scheduled Report Snapshot</p>
              <h1 style="font-size:36px;margin:12px 0 8px 0;">{escape(dashboard.name)}</h1>
              <p style="font-size:16px;color:#475569;line-height:1.6;">{escape(dashboard.description or 'No dashboard description provided.')}</p>
              <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:24px;">
                <div style="background:#f8fafc;border-radius:16px;padding:16px;"><strong>Requested Format</strong><div style="margin-top:8px;">{escape(requested_format)}</div></div>
                <div style="background:#f8fafc;border-radius:16px;padding:16px;"><strong>Generated At</strong><div style="margin-top:8px;">{escape(snapshot.started_at.isoformat() if snapshot.started_at else datetime.now(timezone.utc).isoformat())}</div></div>
                <div style="background:#f8fafc;border-radius:16px;padding:16px;"><strong>Delivery Note</strong><div style="margin-top:8px;">{escape(str(schedule.config_json.get('deliveryNote', 'None')))}</div></div>
              </div>
              <div style="margin-top:24px;padding:16px;border-radius:16px;background:#ecfeff;color:#155e75;">
                This MVP report export produces an HTML report artifact for requested {escape(requested_format).upper()} output so the schedule generates a usable stored file without needing a separate PDF/PNG renderer.
              </div>
              {''.join(sections)}
            </div>
          </body>
        </html>
        """

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
