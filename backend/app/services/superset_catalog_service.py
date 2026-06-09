import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa
from deltalake import DeltaTable as DeltaLakeTable
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, ROOT_DIR, get_settings
from app.models.bi import SemanticDataset
from app.models.catalog import DeltaTable, UploadedFile
from app.utils.naming import slugify_identifier


class SupersetCatalogService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.serving_dir = Path(self.settings.serving_storage_path)
        self.database_path = self.serving_dir / "datawizz_superset.duckdb"
        self.state_path = self.serving_dir / "datawizz_superset_state.json"
        self.meta_schema = "_datawizz_meta"

    def ensure_directories(self) -> None:
        self.serving_dir.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> duckdb.DuckDBPyConnection:
        self.ensure_directories()
        return duckdb.connect(database=str(self.database_path))

    def _quote_identifier(self, value: str) -> str:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'

    def _qualified_name(self, schema_name: str, object_name: str) -> str:
        return f"{self._quote_identifier(schema_name)}.{self._quote_identifier(object_name)}"

    def _raw_object_name(self, file_record: UploadedFile) -> str:
        return slugify_identifier(file_record.name) or f"file_{file_record.id[:8]}"

    def _dataset_object_name(self, dataset: SemanticDataset) -> str:
        return slugify_identifier(dataset.name) or f"dataset_{dataset.id[:8]}"

    def _delta_object_name(self, table_record: DeltaTable) -> str:
        return slugify_identifier(table_record.name) or f"table_{table_record.id[:8]}"

    def _resolve_storage_path(self, storage_path: str) -> Path:
        path = Path(storage_path)
        if path.is_absolute():
            return path

        candidates = [
            (Path.cwd() / path).resolve(),
            (BACKEND_DIR / path).resolve(),
            (ROOT_DIR / path).resolve(),
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[1]

    def _empty_table_sql(self, columns: list[tuple[str, str]]) -> str:
        parts = [f"CAST(NULL AS {column_type}) AS {self._quote_identifier(column_name)}" for column_name, column_type in columns]
        return f"SELECT {', '.join(parts)} WHERE FALSE"

    def _write_inventory_table(self, conn: duckdb.DuckDBPyConnection, assets: list[dict[str, Any]], summary: dict[str, Any]) -> None:
        conn.execute(f"CREATE SCHEMA IF NOT EXISTS {self._quote_identifier(self.meta_schema)}")

        inventory_columns = [
            ("asset_kind", "VARCHAR"),
            ("object_schema", "VARCHAR"),
            ("object_name", "VARCHAR"),
            ("display_name", "VARCHAR"),
            ("source_type", "VARCHAR"),
            ("source_ref", "VARCHAR"),
            ("description", "VARCHAR"),
            ("row_count", "BIGINT"),
            ("updated_at", "VARCHAR"),
        ]
        if assets:
            conn.register("superset_inventory_rows", pa.Table.from_pylist(assets))
            conn.execute(
                f"CREATE OR REPLACE TABLE {self._qualified_name(self.meta_schema, 'asset_inventory')} AS "
                "SELECT * FROM superset_inventory_rows"
            )
            conn.unregister("superset_inventory_rows")
        else:
            conn.execute(
                f"CREATE OR REPLACE TABLE {self._qualified_name(self.meta_schema, 'asset_inventory')} AS "
                f"{self._empty_table_sql(inventory_columns)}"
            )

        status_rows = [
            {
                "catalog_status": summary["catalog_status"],
                "last_synced_at": summary["last_synced_at"],
                "last_sync_reason": summary["last_sync_reason"],
                "raw_files": summary["asset_counts"]["raw_files"],
                "curated_tables": summary["asset_counts"]["curated_tables"],
                "semantic_datasets": summary["asset_counts"]["semantic_datasets"],
                "database_path": summary["database_path"],
                "host_sqlalchemy_uri": summary["host_sqlalchemy_uri"],
                "container_sqlalchemy_uri": summary["container_sqlalchemy_uri"],
            }
        ]
        conn.register("superset_catalog_status_rows", pa.Table.from_pylist(status_rows))
        conn.execute(
            f"CREATE OR REPLACE TABLE {self._qualified_name(self.meta_schema, 'catalog_status')} AS "
            "SELECT * FROM superset_catalog_status_rows"
        )
        conn.unregister("superset_catalog_status_rows")

    def _write_state(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.ensure_directories()
        self.state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    def _host_sqlalchemy_uri(self) -> str:
        return f"duckdb:///{self.database_path}"

    def _container_sqlalchemy_uri(self) -> str:
        return "duckdb:////datawizz-storage/serving/datawizz_superset.duckdb"

    def _failure_payload(self, *, reason: str, error: str) -> dict[str, Any]:
        return {
            "catalog_status": "failed",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "last_sync_reason": reason,
            "last_error": error,
            "database_path": str(self.database_path),
            "host_sqlalchemy_uri": self._host_sqlalchemy_uri(),
            "container_sqlalchemy_uri": self._container_sqlalchemy_uri(),
            "asset_counts": {"raw_files": 0, "curated_tables": 0, "semantic_datasets": 0, "total": 0},
            "schemas": [],
            "assets": [],
        }

    def _render_rows_to_arrow(self, dataset: SemanticDataset) -> pa.Table:
        config = dataset.source_config_json or {}
        rows = config.get("snapshot_rows") if isinstance(config, dict) else []
        schema_json = config.get("snapshot_schema") if isinstance(config, dict) else []

        safe_rows = rows if isinstance(rows, list) else []
        safe_schema = schema_json if isinstance(schema_json, list) else []
        if safe_rows:
            return pa.Table.from_pylist(safe_rows)
        if safe_schema:
            fields = [pa.field(str(column.get("name", "column")), pa.string()) for column in safe_schema]
            return pa.Table.from_arrays([pa.array([], type=field.type) for field in fields], schema=pa.schema(fields))
        return pa.table({})

    def sync(self, db: Session, *, reason: str = "manual") -> dict[str, Any]:
        uploaded_files = db.query(UploadedFile).order_by(UploadedFile.created_at.asc()).all()
        delta_tables = db.query(DeltaTable).order_by(DeltaTable.created_at.asc()).all()
        semantic_datasets = db.query(SemanticDataset).order_by(SemanticDataset.created_at.asc()).all()

        managed_schemas = {"raw", "semantic"}
        managed_schemas.update(
            slugify_identifier(table.schema_name) or "analytics"
            for table in delta_tables
        )

        assets: list[dict[str, Any]] = []
        conn = self._connect()
        try:
            for schema_name in sorted(managed_schemas):
                conn.execute(f"CREATE SCHEMA IF NOT EXISTS {self._quote_identifier(schema_name)}")

            existing_objects = conn.execute(
                """
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_schema IN (
                  SELECT UNNEST(?)
                )
                ORDER BY CASE WHEN table_type = 'VIEW' THEN 0 ELSE 1 END
                """,
                [list(sorted(managed_schemas))],
            ).fetchall()
            for table_schema, table_name, table_type in existing_objects:
                drop_kind = "VIEW" if str(table_type).upper() == "VIEW" else "TABLE"
                conn.execute(f"DROP {drop_kind} IF EXISTS {self._qualified_name(table_schema, table_name)}")

            for file_record in uploaded_files:
                object_name = self._raw_object_name(file_record)
                qualified_name = self._qualified_name("raw", object_name)
                storage_path = str(self._resolve_storage_path(file_record.storage_path)).replace("'", "''")
                if file_record.file_type == "csv":
                    sql = f"CREATE TABLE {qualified_name} AS SELECT * FROM read_csv_auto('{storage_path}', union_by_name=true)"
                elif file_record.file_type == "json":
                    sql = f"CREATE TABLE {qualified_name} AS SELECT * FROM read_json_auto('{storage_path}')"
                elif file_record.file_type == "parquet":
                    sql = f"CREATE TABLE {qualified_name} AS SELECT * FROM parquet_scan('{storage_path}')"
                else:
                    continue
                conn.execute(sql)
                assets.append(
                    {
                        "asset_kind": "raw_file",
                        "object_schema": "raw",
                        "object_name": object_name,
                        "display_name": file_record.name,
                        "source_type": file_record.file_type,
                        "source_ref": file_record.storage_path,
                        "description": f"Uploaded {file_record.file_type.upper()} file from the raw zone.",
                        "row_count": file_record.row_count,
                        "updated_at": file_record.updated_at.isoformat(),
                    }
                )

            delta_name_map: dict[str, tuple[str, str]] = {}
            for table_record in delta_tables:
                schema_name = slugify_identifier(table_record.schema_name) or "analytics"
                object_name = self._delta_object_name(table_record)
                qualified_name = self._qualified_name(schema_name, object_name)
                arrow_table = DeltaLakeTable(str(self._resolve_storage_path(table_record.storage_path))).to_pyarrow_table()
                temp_name = f"delta_materialize_{table_record.id.replace('-', '_')}"
                conn.register(temp_name, arrow_table)
                conn.execute(f"CREATE TABLE {qualified_name} AS SELECT * FROM {self._quote_identifier(temp_name)}")
                conn.unregister(temp_name)
                delta_name_map[table_record.name] = (schema_name, object_name)
                assets.append(
                    {
                        "asset_kind": "curated_table",
                        "object_schema": schema_name,
                        "object_name": object_name,
                        "display_name": f"{table_record.schema_name}.{table_record.name}",
                        "source_type": "delta_table",
                        "source_ref": table_record.storage_path,
                        "description": table_record.description or "Curated Delta Lake table published by DataWizz.",
                        "row_count": table_record.row_count,
                        "updated_at": table_record.updated_at.isoformat(),
                    }
                )

            for dataset in semantic_datasets:
                object_name = self._dataset_object_name(dataset)
                qualified_name = self._qualified_name("semantic", object_name)
                if dataset.source_type == "delta_table":
                    source_name = str(dataset.source_ref)
                    source_mapping = delta_name_map.get(source_name)
                    if source_mapping is None:
                        continue
                    source_schema, source_object_name = source_mapping
                    conn.execute(
                        f"CREATE VIEW {qualified_name} AS "
                        f"SELECT * FROM {self._qualified_name(source_schema, source_object_name)}"
                    )
                    assets.append(
                        {
                            "asset_kind": "semantic_dataset",
                            "object_schema": "semantic",
                            "object_name": object_name,
                            "display_name": dataset.name,
                            "source_type": dataset.source_type,
                            "source_ref": dataset.source_ref,
                            "description": dataset.description or f"Semantic dataset mapped to {dataset.source_ref}.",
                            "row_count": None,
                            "updated_at": dataset.updated_at.isoformat(),
                        }
                    )
                elif dataset.source_type == "notebook_snapshot":
                    snapshot_table = self._render_rows_to_arrow(dataset)
                    temp_name = f"semantic_snapshot_{dataset.id.replace('-', '_')}"
                    conn.register(temp_name, snapshot_table)
                    conn.execute(f"CREATE TABLE {qualified_name} AS SELECT * FROM {self._quote_identifier(temp_name)}")
                    conn.unregister(temp_name)
                    source_config = dataset.source_config_json or {}
                    snapshot_rows = source_config.get("snapshot_rows") if isinstance(source_config, dict) else []
                    assets.append(
                        {
                            "asset_kind": "semantic_dataset",
                            "object_schema": "semantic",
                            "object_name": object_name,
                            "display_name": dataset.name,
                            "source_type": dataset.source_type,
                            "source_ref": dataset.source_ref,
                            "description": dataset.description or "Notebook snapshot dataset published from Engine Lab.",
                            "row_count": len(snapshot_rows) if isinstance(snapshot_rows, list) else None,
                            "updated_at": dataset.updated_at.isoformat(),
                        }
                    )

            summary = {
                "catalog_status": "ready",
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
                "last_sync_reason": reason,
                "last_error": None,
                "database_path": str(self.database_path),
                "host_sqlalchemy_uri": self._host_sqlalchemy_uri(),
                "container_sqlalchemy_uri": self._container_sqlalchemy_uri(),
                "asset_counts": {
                    "raw_files": len([asset for asset in assets if asset["asset_kind"] == "raw_file"]),
                    "curated_tables": len([asset for asset in assets if asset["asset_kind"] == "curated_table"]),
                    "semantic_datasets": len([asset for asset in assets if asset["asset_kind"] == "semantic_dataset"]),
                    "total": len(assets),
                },
                "schemas": sorted(
                    {
                        asset["object_schema"]
                        for asset in assets
                    }
                ),
                "assets": assets,
            }
            self._write_inventory_table(conn, assets, summary)
            return self._write_state(summary)
        finally:
            conn.close()

    def safe_sync(self, db: Session, *, reason: str = "manual") -> dict[str, Any]:
        try:
            return self.sync(db, reason=reason)
        except Exception as exc:  # noqa: BLE001
            return self._write_state(self._failure_payload(reason=reason, error=str(exc)))

    def get_status(self) -> dict[str, Any]:
        if self.state_path.exists():
            try:
                return json.loads(self.state_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
        return {
            "catalog_status": "not_initialized",
            "last_synced_at": None,
            "last_sync_reason": None,
            "last_error": None,
            "database_path": str(self.database_path),
            "host_sqlalchemy_uri": self._host_sqlalchemy_uri(),
            "container_sqlalchemy_uri": self._container_sqlalchemy_uri(),
            "asset_counts": {"raw_files": 0, "curated_tables": 0, "semantic_datasets": 0, "total": 0},
            "schemas": [],
            "assets": [],
        }


superset_catalog_service = SupersetCatalogService()
