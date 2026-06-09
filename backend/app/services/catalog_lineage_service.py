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
        lineage_counts = {
            "semantic_datasets": len(semantic_datasets),
            "charts": len(charts),
            "dashboards": len(dashboard_map),
            "report_schedules": len(report_schedules),
            "related_pipelines": len(related_pipelines),
            "notebook_artifacts": len(notebook_artifacts),
        }

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
            "counts": lineage_counts,
            "impact_analysis": self._build_impact_analysis(
                table=table,
                counts=lineage_counts,
                related_pipelines=related_pipelines,
                notebook_artifacts=notebook_artifacts,
                semantic_datasets=semantic_datasets,
                charts=charts,
                dashboards=list(dashboard_map.values()),
                report_schedules=report_schedules,
            ),
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

    def _build_impact_analysis(
        self,
        *,
        table: DeltaTable,
        counts: dict,
        related_pipelines: list[dict],
        notebook_artifacts: list[NotebookArtifact],
        semantic_datasets: list[SemanticDataset],
        charts: list[Chart],
        dashboards: list[Dashboard],
        report_schedules: list[ReportSchedule],
    ) -> dict:
        total_downstream_assets = (
            counts["semantic_datasets"]
            + counts["charts"]
            + counts["dashboards"]
            + counts["report_schedules"]
        )
        score = min(
            100,
            counts["semantic_datasets"] * 8
            + counts["charts"] * 12
            + counts["dashboards"] * 18
            + counts["report_schedules"] * 22
            + counts["related_pipelines"] * 10
            + counts["notebook_artifacts"] * 6,
        )
        if counts["report_schedules"] >= 2 or counts["dashboards"] >= 3 or score >= 85:
            severity = "critical"
        elif counts["report_schedules"] >= 1 or counts["dashboards"] >= 1 or score >= 45:
            severity = "high"
        elif total_downstream_assets > 0 or counts["related_pipelines"] > 0 or counts["notebook_artifacts"] > 0:
            severity = "medium"
        else:
            severity = "low"

        if counts["report_schedules"] > 0 or counts["dashboards"] > 0:
            business_exposure = "Executive-facing BI dependencies exist. Treat schema or semantic changes as stakeholder-visible."
        elif counts["charts"] > 0 or counts["semantic_datasets"] > 0:
            business_exposure = "Analyst-facing BI dependencies exist. Validate semantic contracts before changing the table."
        else:
            business_exposure = "Low BI exposure right now. This table is not widely consumed by dashboards or scheduled reports."

        if counts["related_pipelines"] > 1:
            orchestration_exposure = "Multiple pipelines reference this table. Coordinate changes with orchestration owners."
        elif counts["related_pipelines"] == 1:
            orchestration_exposure = "One pipeline references this table. Check node configuration and downstream contracts."
        else:
            orchestration_exposure = "No pipeline definitions currently target this table."

        if counts["notebook_artifacts"] > 1:
            notebook_exposure = "Multiple notebook publishes are tied to this asset. Engine Lab users may need to rerun saved results."
        elif counts["notebook_artifacts"] == 1:
            notebook_exposure = "One notebook publish is recorded for this asset."
        else:
            notebook_exposure = "No retained notebook publishes are linked to this table."

        recommended_checks: list[str] = []
        if counts["semantic_datasets"] > 0:
            recommended_checks.append("Validate semantic dataset dimensions and metrics against the changed schema.")
        if counts["charts"] > 0:
            recommended_checks.append("Re-run saved chart previews that depend on this table to confirm grouping and measure logic still holds.")
        if counts["dashboards"] > 0:
            recommended_checks.append("Review dashboard widgets for blank states, filter regressions, and metric drift after the change.")
        if counts["report_schedules"] > 0:
            recommended_checks.append("Execute at least one linked report schedule before shipping the change to verify exported artifacts still render.")
        if counts["related_pipelines"] > 0:
            recommended_checks.append("Check pipeline write/read contracts, especially writeDelta node targets and scheduled runs.")
        if counts["notebook_artifacts"] > 0:
            recommended_checks.append("Ask notebook owners to rerun published cells so saved notebook outputs stay aligned with the table.")
        if not recommended_checks:
            recommended_checks.append("This table has limited retained lineage. A localized schema or logic change is likely low-risk.")

        highest_risk_assets: list[dict] = []
        for schedule in report_schedules[:3]:
            highest_risk_assets.append(
                {
                    "kind": "report_schedule",
                    "asset_id": schedule.id,
                    "label": schedule.name,
                    "secondary_label": f"{schedule.frequency} · {schedule.destination}",
                    "reason": "Scheduled exports may fail or deliver stale business-facing artifacts after this change.",
                    "severity": "critical",
                    "route_ref": f"/bi/reports?scheduleId={schedule.id}" + (f"&dashboardId={schedule.dashboard_id}" if schedule.dashboard_id else ""),
                }
            )
        for dashboard in dashboards[:3]:
            highest_risk_assets.append(
                {
                    "kind": "dashboard",
                    "asset_id": dashboard.id,
                    "label": dashboard.name,
                    "secondary_label": dashboard.description,
                    "reason": "Dashboard widgets can regress immediately if schema, semantics, or row-level expectations change.",
                    "severity": "high" if severity != "low" else "medium",
                    "route_ref": f"/bi/dashboards?dashboardId={dashboard.id}",
                }
            )
        for chart in charts[:3]:
            highest_risk_assets.append(
                {
                    "kind": "chart",
                    "asset_id": chart.id,
                    "label": chart.name,
                    "secondary_label": chart.chart_type,
                    "reason": "Saved charts should be re-previewed to validate dimensions, measures, and filters.",
                    "severity": "high" if counts["charts"] > 2 else "medium",
                    "route_ref": f"/bi/charts?chartId={chart.id}",
                }
            )
        for pipeline in related_pipelines[:2]:
            highest_risk_assets.append(
                {
                    "kind": "pipeline",
                    "asset_id": pipeline["pipeline_id"],
                    "label": pipeline["pipeline_name"],
                    "secondary_label": pipeline.get("node_id"),
                    "reason": "Pipeline orchestration depends on this table contract and should be revalidated before rollout.",
                    "severity": "medium",
                    "route_ref": f"/pipelines?pipelineId={pipeline['pipeline_id']}",
                }
            )
        for artifact in notebook_artifacts[:2]:
            highest_risk_assets.append(
                {
                    "kind": "notebook",
                    "asset_id": artifact.notebook_id,
                    "label": artifact.display_name,
                    "secondary_label": artifact.cell_title or artifact.cell_id,
                    "reason": "Notebook-published outputs may need to be rerun to stay consistent with the curated table.",
                    "severity": "medium",
                    "route_ref": f"/engines?notebookId={artifact.notebook_id}",
                }
            )
        for dataset in semantic_datasets[:2]:
            highest_risk_assets.append(
                {
                    "kind": "semantic_dataset",
                    "asset_id": dataset.id,
                    "label": dataset.name,
                    "secondary_label": f"{len(dataset.metrics_json or [])} metrics · {len(dataset.dimensions_json or [])} dimensions",
                    "reason": "Semantic definitions can drift if source columns or business logic change.",
                    "severity": "medium",
                    "route_ref": f"/bi/datasets?datasetId={dataset.id}",
                }
            )

        if severity == "critical":
            safe_change_summary = f"{table.schema_name}.{table.name} has broad downstream exposure. Treat changes as coordinated releases with BI and orchestration validation."
        elif severity == "high":
            safe_change_summary = f"{table.schema_name}.{table.name} is actively consumed. Make changes behind a validation pass across dependent assets."
        elif severity == "medium":
            safe_change_summary = f"{table.schema_name}.{table.name} has some retained dependents. Verify linked assets before publishing structural or logic changes."
        else:
            safe_change_summary = f"{table.schema_name}.{table.name} currently has a small retained blast radius and appears safe for isolated evolution."

        return {
            "severity": severity,
            "score": score,
            "total_downstream_assets": total_downstream_assets,
            "business_exposure": business_exposure,
            "orchestration_exposure": orchestration_exposure,
            "notebook_exposure": notebook_exposure,
            "safe_change_summary": safe_change_summary,
            "recommended_checks": recommended_checks,
            "highest_risk_assets": highest_risk_assets[:6],
        }


catalog_lineage_service = CatalogLineageService()
