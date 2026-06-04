from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.models.bi import Chart, Dashboard, DashboardWidget, ReportSchedule, SemanticDataset
from app.models.catalog import DeltaTable
from app.models.notebook import NotebookArtifact, NotebookDocument
from app.models.pipeline import Pipeline


PIPELINE_SOURCE_RE = re.compile(r"^Pipeline (?P<name>.+) node (?P<node_id>.+)$")
NOTEBOOK_SOURCE_RE = re.compile(r"^Notebook cell export from (?P<name>.+)::(?P<cell_title>.+) via (?P<engine_id>.+)$")


class CatalogLineageService:
    def build_table_lineage(self, db: Session, table: DeltaTable) -> dict:
        semantic_datasets = (
            db.query(SemanticDataset)
            .filter(SemanticDataset.source_type == "delta_table", SemanticDataset.source_ref == table.name)
            .order_by(SemanticDataset.updated_at.desc())
            .all()
        )
        dataset_ids = [dataset.id for dataset in semantic_datasets]
        charts = db.query(Chart).filter(Chart.dataset_id.in_(dataset_ids)).order_by(Chart.updated_at.desc()).all() if dataset_ids else []
        chart_ids = [chart.id for chart in charts]
        widgets = (
            db.query(DashboardWidget)
            .filter(DashboardWidget.chart_id.in_(chart_ids))
            .order_by(DashboardWidget.updated_at.desc())
            .all()
            if chart_ids
            else []
        )

        dashboard_map: dict[str, Dashboard] = {}
        for widget in widgets:
            dashboard = db.query(Dashboard).filter(Dashboard.id == widget.dashboard_id).one_or_none()
            if dashboard is not None:
                dashboard_map[dashboard.id] = dashboard

        dashboard_ids = list(dashboard_map.keys())
        report_schedules = (
            db.query(ReportSchedule)
            .filter(ReportSchedule.dashboard_id.in_(dashboard_ids))
            .order_by(ReportSchedule.updated_at.desc())
            .all()
            if dashboard_ids
            else []
        )

        related_pipelines = []
        for pipeline in db.query(Pipeline).order_by(Pipeline.updated_at.desc()).all():
            for node in (pipeline.definition_json or {}).get("nodes", []):
                if node.get("type") != "writeDelta":
                    continue
                config = (node.get("data") or {}).get("config") or {}
                if config.get("tableName") == table.name:
                    related_pipelines.append(
                        {
                            "pipeline_id": pipeline.id,
                            "pipeline_name": pipeline.name,
                            "node_id": node.get("id"),
                            "schedule_cron": pipeline.schedule_cron,
                            "updated_at": pipeline.updated_at.isoformat(),
                        }
                    )
                    break

        notebook_artifacts = (
            db.query(NotebookArtifact)
            .filter(NotebookArtifact.delta_table_id == table.id)
            .order_by(NotebookArtifact.created_at.desc())
            .all()
        )

        upstream = self._resolve_upstream(db, table, related_pipelines, notebook_artifacts)

        return {
            "table_id": table.id,
            "table_name": table.name,
            "schema_name": table.schema_name,
            "upstream": upstream,
            "related_pipelines": related_pipelines,
            "notebook_artifacts": [
                {
                    "artifact_id": artifact.id,
                    "notebook_id": artifact.notebook_id,
                    "cell_id": artifact.cell_id,
                    "cell_title": artifact.cell_title,
                    "artifact_kind": artifact.artifact_kind,
                    "display_name": artifact.display_name,
                    "row_count": artifact.row_count,
                    "created_at": artifact.created_at.isoformat(),
                }
                for artifact in notebook_artifacts
            ],
            "semantic_datasets": [
                {
                    "dataset_id": dataset.id,
                    "dataset_name": dataset.name,
                    "metrics_count": len(dataset.metrics_json or []),
                    "dimensions_count": len(dataset.dimensions_json or []),
                    "updated_at": dataset.updated_at.isoformat(),
                }
                for dataset in semantic_datasets
            ],
            "charts": [
                {
                    "chart_id": chart.id,
                    "chart_name": chart.name,
                    "chart_type": chart.chart_type,
                    "dataset_id": chart.dataset_id,
                    "updated_at": chart.updated_at.isoformat(),
                }
                for chart in charts
            ],
            "dashboards": [
                {
                    "dashboard_id": dashboard.id,
                    "dashboard_name": dashboard.name,
                    "dashboard_description": dashboard.description,
                    "updated_at": dashboard.updated_at.isoformat(),
                }
                for dashboard in dashboard_map.values()
            ],
            "report_schedules": [
                {
                    "schedule_id": schedule.id,
                    "schedule_name": schedule.name,
                    "dashboard_id": schedule.dashboard_id,
                    "frequency": schedule.frequency,
                    "destination": schedule.destination,
                    "updated_at": schedule.updated_at.isoformat(),
                }
                for schedule in report_schedules
            ],
            "counts": {
                "semantic_datasets": len(semantic_datasets),
                "charts": len(charts),
                "dashboards": len(dashboard_map),
                "report_schedules": len(report_schedules),
                "related_pipelines": len(related_pipelines),
                "notebook_artifacts": len(notebook_artifacts),
            },
        }

    def _resolve_upstream(
        self,
        db: Session,
        table: DeltaTable,
        related_pipelines: list[dict],
        notebook_artifacts: list[NotebookArtifact],
    ) -> dict:
        source_query = (table.source_query or "").strip()

        if notebook_artifacts:
            artifact = notebook_artifacts[0]
            notebook = db.query(NotebookDocument).filter(NotebookDocument.id == artifact.notebook_id).one_or_none()
            return {
                "kind": "notebook",
                "label": "Notebook publish",
                "notebook_id": artifact.notebook_id,
                "notebook_name": notebook.name if notebook else None,
                "cell_id": artifact.cell_id,
                "cell_title": artifact.cell_title,
                "artifact_id": artifact.id,
                "engine_id": (artifact.metadata_json or {}).get("engine_id"),
                "source_query": source_query or None,
            }

        pipeline_match = PIPELINE_SOURCE_RE.match(source_query)
        if pipeline_match:
            pipeline_name = pipeline_match.group("name")
            node_id = pipeline_match.group("node_id")
            pipeline = db.query(Pipeline).filter(Pipeline.name == pipeline_name).one_or_none()
            return {
                "kind": "pipeline",
                "label": "Pipeline publish",
                "pipeline_id": pipeline.id if pipeline else None,
                "pipeline_name": pipeline_name,
                "node_id": node_id,
                "schedule_cron": pipeline.schedule_cron if pipeline else None,
                "source_query": source_query,
            }

        notebook_match = NOTEBOOK_SOURCE_RE.match(source_query)
        if notebook_match:
            notebook_name = notebook_match.group("name")
            notebook = db.query(NotebookDocument).filter(NotebookDocument.name == notebook_name).one_or_none()
            return {
                "kind": "notebook",
                "label": "Notebook publish",
                "notebook_id": notebook.id if notebook else None,
                "notebook_name": notebook_name,
                "cell_title": notebook_match.group("cell_title"),
                "engine_id": notebook_match.group("engine_id"),
                "source_query": source_query,
            }

        if source_query:
            return {
                "kind": "sql",
                "label": "SQL publish",
                "source_query": source_query,
            }

        if related_pipelines:
            primary = related_pipelines[0]
            return {
                "kind": "pipeline",
                "label": "Pipeline target",
                "pipeline_id": primary["pipeline_id"],
                "pipeline_name": primary["pipeline_name"],
                "node_id": primary["node_id"],
                "schedule_cron": primary["schedule_cron"],
                "source_query": None,
            }

        return {
            "kind": "unknown",
            "label": "Unknown origin",
            "source_query": source_query or None,
        }


catalog_lineage_service = CatalogLineageService()
