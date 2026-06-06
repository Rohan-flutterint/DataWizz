import json
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings
from app.models.catalog import DeltaTable


class CatalogMetadataService:
    def __init__(self) -> None:
        settings = get_settings()
        self.metadata_path = Path(settings.temp_storage_path) / "catalog_table_metadata.json"

    def _load_registry(self) -> dict[str, dict]:
        if not self.metadata_path.exists():
            return {}
        try:
            return json.loads(self.metadata_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {}

    def _save_registry(self, registry: dict[str, dict]) -> None:
        self.metadata_path.parent.mkdir(parents=True, exist_ok=True)
        self.metadata_path.write_text(json.dumps(registry, indent=2), encoding="utf-8")

    def _default_freshness(self, table: DeltaTable) -> str:
        reference = table.last_refreshed_at or table.updated_at or table.created_at
        if reference is None:
            return "unknown"
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - reference).total_seconds() / 3600
        if age_hours <= 24:
            return "fresh"
        if age_hours <= 24 * 7:
            return "aging"
        return "stale"

    def _default_lineage_hint(self, table: DeltaTable) -> str:
        source_query = (table.source_query or "").strip()
        if source_query.startswith("Pipeline "):
            return "Pipeline-authored Delta table"
        if source_query:
            return "SQL workspace authored Delta table"
        return "Curated table with no retained lineage string"

    def get_metadata(self, table: DeltaTable) -> dict:
        registry = self._load_registry()
        stored = registry.get(table.id, {})
        default_tags = ["delta", table.schema_name, table.mode]
        tags = stored.get("tags") or default_tags
        return {
            "owner": stored.get("owner") or ("analytics_engineering" if table.schema_name == "analytics" else "data_platform"),
            "tags": tags,
            "freshness_status": stored.get("freshness_status") or self._default_freshness(table),
            "lineage_hint": stored.get("lineage_hint") or self._default_lineage_hint(table),
        }

    def enrich_table(self, table: DeltaTable) -> dict:
        payload = {
            "id": table.id,
            "name": table.name,
            "schema_name": table.schema_name,
            "storage_path": table.storage_path,
            "description": table.description,
            "schema_json": table.schema_json,
            "mode": table.mode,
            "source_query": table.source_query,
            "row_count": table.row_count,
            "last_refreshed_at": table.last_refreshed_at,
            "created_at": table.created_at,
            "updated_at": table.updated_at,
        }
        payload.update(self.get_metadata(table))
        return payload

    def attach_governance(self, enriched_table: dict, governance: dict) -> dict:
        payload = dict(enriched_table)
        payload.update(
            {
                "governance_score": governance.get("score"),
                "governance_grade": governance.get("grade"),
                "governance_status": governance.get("status"),
                "governance_summary": governance.get("summary"),
                "governance_strengths": governance.get("strengths", []),
                "governance_gaps": governance.get("gaps", []),
                "governance_breakdown": governance.get("breakdown", []),
            }
        )
        return payload

    def update_metadata(self, table: DeltaTable, *, owner: str | None, tags: list[str] | None, lineage_hint: str | None) -> dict:
        registry = self._load_registry()
        current = registry.get(table.id, {})
        current["owner"] = owner.strip() if owner else current.get("owner")
        current["tags"] = [tag.strip() for tag in (tags or current.get("tags") or []) if tag and tag.strip()]
        current["lineage_hint"] = lineage_hint.strip() if lineage_hint else current.get("lineage_hint")
        current["freshness_status"] = self._default_freshness(table)
        registry[table.id] = current
        self._save_registry(registry)
        return self.enrich_table(table)

    def refresh_freshness(self, table: DeltaTable) -> dict:
        registry = self._load_registry()
        current = registry.get(table.id, {})
        current["freshness_status"] = self._default_freshness(table)
        registry[table.id] = current
        self._save_registry(registry)
        return self.enrich_table(table)
