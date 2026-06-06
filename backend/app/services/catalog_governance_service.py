from __future__ import annotations

from app.models.catalog import DeltaTable


class CatalogGovernanceService:
    def build_score(self, table: DeltaTable, metadata: dict, lineage: dict | None = None) -> dict:
        lineage_counts = (lineage or {}).get("counts", {})
        upstream = (lineage or {}).get("upstream", {}) if lineage else {}
        tags = metadata.get("tags") or []
        description = (table.description or "").strip()
        schema_definition = table.schema_json or []
        freshness_status = metadata.get("freshness_status") or "unknown"
        lineage_hint = (metadata.get("lineage_hint") or "").strip()
        owner = (metadata.get("owner") or "").strip()
        row_count = table.row_count

        breakdown = [
            self._score_item(
                key="owner",
                label="Owner assigned",
                max_points=15,
                earned_points=15 if owner else 0,
                status="strong" if owner else "missing",
                detail=owner or "Assign a clear owner for stewardship.",
            ),
            self._score_item(
                key="tags",
                label="Tags coverage",
                max_points=10,
                earned_points=10 if len(tags) >= 2 else 5 if len(tags) == 1 else 0,
                status="strong" if len(tags) >= 2 else "partial" if len(tags) == 1 else "missing",
                detail=", ".join(tags) if tags else "Add at least two descriptive tags.",
            ),
            self._score_item(
                key="description",
                label="Catalog description",
                max_points=10,
                earned_points=10 if description else 0,
                status="strong" if description else "missing",
                detail=description or "Describe what this curated table contains and how it should be used.",
            ),
            self._score_item(
                key="schema",
                label="Schema definition",
                max_points=10,
                earned_points=10 if schema_definition else 0,
                status="strong" if schema_definition else "missing",
                detail=f"{len(schema_definition)} columns profiled." if schema_definition else "No schema JSON is stored yet.",
            ),
            self._score_item(
                key="row_count",
                label="Row count tracked",
                max_points=5,
                earned_points=5 if row_count is not None else 0,
                status="strong" if row_count is not None else "missing",
                detail=f"{row_count} rows captured." if row_count is not None else "Refresh metadata to capture row volume.",
            ),
            self._score_item(
                key="freshness",
                label="Freshness state",
                max_points=15,
                earned_points=15 if freshness_status == "fresh" else 10 if freshness_status == "aging" else 4 if freshness_status == "stale" else 0,
                status="strong" if freshness_status == "fresh" else "partial" if freshness_status in {"aging", "stale"} else "missing",
                detail=f"Status is {freshness_status}.",
            ),
            self._score_item(
                key="lineage_hint",
                label="Lineage annotation",
                max_points=10,
                earned_points=10 if lineage_hint and "unavailable" not in lineage_hint.lower() and "no retained lineage" not in lineage_hint.lower() else 4 if lineage_hint else 0,
                status="strong" if lineage_hint and "no retained lineage" not in lineage_hint.lower() else "partial" if lineage_hint else "missing",
                detail=lineage_hint or "Capture how this table was produced.",
            ),
            self._score_item(
                key="upstream",
                label="Upstream traceability",
                max_points=10,
                earned_points=10 if upstream and upstream.get("kind") not in {None, "", "unknown"} else 0,
                status="strong" if upstream and upstream.get("kind") not in {None, "", "unknown"} else "missing",
                detail=upstream.get("label") or "No upstream creator is resolved.",
            ),
            self._score_item(
                key="downstream",
                label="Downstream adoption",
                max_points=10,
                earned_points=10 if (lineage_counts.get("semantic_datasets", 0) + lineage_counts.get("charts", 0) + lineage_counts.get("dashboards", 0) + lineage_counts.get("report_schedules", 0)) > 0 else 0,
                status="strong" if (lineage_counts.get("semantic_datasets", 0) + lineage_counts.get("charts", 0) + lineage_counts.get("dashboards", 0) + lineage_counts.get("report_schedules", 0)) > 0 else "missing",
                detail=(
                    f"{lineage_counts.get('semantic_datasets', 0)} datasets, "
                    f"{lineage_counts.get('charts', 0)} charts, "
                    f"{lineage_counts.get('dashboards', 0)} dashboards."
                ),
            ),
            self._score_item(
                key="operations",
                label="Operational integration",
                max_points=5,
                earned_points=5 if (lineage_counts.get("related_pipelines", 0) + lineage_counts.get("notebook_artifacts", 0)) > 0 else 0,
                status="strong" if (lineage_counts.get("related_pipelines", 0) + lineage_counts.get("notebook_artifacts", 0)) > 0 else "missing",
                detail=(
                    f"{lineage_counts.get('related_pipelines', 0)} pipeline links, "
                    f"{lineage_counts.get('notebook_artifacts', 0)} notebook publish artifacts."
                ),
            ),
        ]

        score = sum(item["earned_points"] for item in breakdown)
        strengths = [item["label"] for item in breakdown if item["status"] == "strong"][:4]
        gaps = [item["label"] for item in breakdown if item["status"] == "missing"][:4]
        summary = self._score_summary(score)

        return {
            "score": score,
            "grade": self._score_grade(score),
            "status": summary["status"],
            "summary": summary["summary"],
            "strengths": strengths,
            "gaps": gaps,
            "breakdown": breakdown,
        }

    def _score_grade(self, score: int) -> str:
        if score >= 90:
            return "A"
        if score >= 75:
            return "B"
        if score >= 60:
            return "C"
        if score >= 40:
            return "D"
        return "E"

    def _score_summary(self, score: int) -> dict:
        if score >= 90:
            return {"status": "excellent", "summary": "Strong governance coverage with clear ownership, lineage, and operational readiness."}
        if score >= 75:
            return {"status": "healthy", "summary": "Good governance posture with only a few metadata or lineage gaps left to close."}
        if score >= 60:
            return {"status": "developing", "summary": "Usable governance baseline, but more documentation and traceability would improve trust."}
        if score >= 40:
            return {"status": "at_risk", "summary": "Several governance signals are missing, so this asset needs stewardship before broad reuse."}
        return {"status": "weak", "summary": "Governance coverage is thin. Add ownership, context, and lineage before treating this as a trusted curated asset."}

    def _score_item(
        self,
        *,
        key: str,
        label: str,
        max_points: int,
        earned_points: int,
        status: str,
        detail: str,
    ) -> dict:
        return {
            "key": key,
            "label": label,
            "max_points": max_points,
            "earned_points": earned_points,
            "status": status,
            "detail": detail,
        }


catalog_governance_service = CatalogGovernanceService()
