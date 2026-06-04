from pathlib import Path
from time import perf_counter

import duckdb
import pyarrow as pa
from deltalake import DeltaTable
from fastapi.encoders import jsonable_encoder

from app.models.catalog import DeltaTable as DeltaTableModel
from app.models.catalog import UploadedFile
from app.utils.naming import slugify_identifier


class DuckDBService:
    def _normalize_rows(self, rows: list[dict]) -> list[dict]:
        return jsonable_encoder(rows)

    def _quote_identifier(self, value: str) -> str:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'

    def _type_family(self, type_name: str) -> str:
        normalized = type_name.lower()
        if any(token in normalized for token in ["int", "decimal", "double", "float", "real", "numeric", "hugeint"]):
            return "numeric"
        if any(token in normalized for token in ["date", "time", "timestamp"]):
            return "temporal"
        if "bool" in normalized:
            return "boolean"
        if any(token in normalized for token in ["char", "text", "string", "varchar", "uuid"]):
            return "string"
        return "other"

    def _build_quality_indicators(
        self,
        *,
        row_count: int,
        null_count: int,
        distinct_count: int,
        blank_count: int = 0,
    ) -> list[str]:
        indicators: list[str] = []
        if row_count <= 0:
            return ["empty sample"]
        if null_count == 0:
            indicators.append("complete")
        elif null_count / row_count >= 0.5:
            indicators.append("high missing values")
        else:
            indicators.append("has missing values")
        if blank_count > 0:
            indicators.append("blank strings")
        if distinct_count <= 1:
            indicators.append("constant values")
        elif distinct_count == row_count and row_count > 1:
            indicators.append("high cardinality")
        return indicators

    def _profile_column(
        self,
        conn: duckdb.DuckDBPyConnection,
        *,
        view_name: str,
        column_name: str,
        column_type: str,
        row_count: int,
    ) -> dict:
        quoted_column = self._quote_identifier(column_name)
        family = self._type_family(column_type)
        base_stats = conn.execute(
            f"""
            SELECT
              SUM(CASE WHEN {quoted_column} IS NULL THEN 1 ELSE 0 END) AS null_count,
              COUNT(DISTINCT {quoted_column}) AS distinct_count
            FROM {view_name}
            """
        ).fetchone()
        null_count = int(base_stats[0] or 0)
        distinct_count = int(base_stats[1] or 0)

        blank_count = 0
        min_value = None
        max_value = None
        avg_value = None
        true_count = None
        false_count = None

        if family == "string":
            blank_count = int(
                conn.execute(
                    f"""
                    SELECT SUM(CASE WHEN {quoted_column} IS NOT NULL AND TRIM(CAST({quoted_column} AS VARCHAR)) = '' THEN 1 ELSE 0 END)
                    FROM {view_name}
                    """
                ).fetchone()[0]
                or 0
            )

        if family in {"numeric", "temporal"}:
            min_max_stats = conn.execute(
                f"""
                SELECT
                  MIN({quoted_column})::VARCHAR AS min_value,
                  MAX({quoted_column})::VARCHAR AS max_value
                FROM {view_name}
                """
            ).fetchone()
            min_value = min_max_stats[0]
            max_value = min_max_stats[1]

        if family == "numeric":
            avg_result = conn.execute(
                f"""
                SELECT AVG(TRY_CAST({quoted_column} AS DOUBLE))
                FROM {view_name}
                WHERE {quoted_column} IS NOT NULL
                """
            ).fetchone()
            avg_value = float(avg_result[0]) if avg_result and avg_result[0] is not None else None

        if family == "boolean":
            true_false_stats = conn.execute(
                f"""
                SELECT
                  SUM(CASE WHEN {quoted_column} = TRUE THEN 1 ELSE 0 END) AS true_count,
                  SUM(CASE WHEN {quoted_column} = FALSE THEN 1 ELSE 0 END) AS false_count
                FROM {view_name}
                """
            ).fetchone()
            true_count = int(true_false_stats[0] or 0)
            false_count = int(true_false_stats[1] or 0)

        sample_values = [
            item[0]
            for item in conn.execute(
                f"""
                SELECT DISTINCT CAST({quoted_column} AS VARCHAR) AS value
                FROM {view_name}
                WHERE {quoted_column} IS NOT NULL
                LIMIT 3
                """
            ).fetchall()
            if item and item[0] is not None
        ]

        completeness_ratio = round(((row_count - null_count) / row_count) * 100, 1) if row_count else 0.0
        return {
            "name": column_name,
            "type": column_type,
            "profile_kind": family,
            "null_count": null_count,
            "distinct_count": distinct_count,
            "blank_count": blank_count,
            "completeness_ratio": completeness_ratio,
            "sample_values": sample_values,
            "min_value": min_value,
            "max_value": max_value,
            "avg_value": avg_value,
            "true_count": true_count,
            "false_count": false_count,
            "quality_indicators": self._build_quality_indicators(
                row_count=row_count,
                null_count=null_count,
                distinct_count=distinct_count,
                blank_count=blank_count,
            ),
        }

    def connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(database=":memory:")

    def register_uploaded_file(self, conn: duckdb.DuckDBPyConnection, file_record: UploadedFile, alias: str | None = None) -> str:
        view_name = alias or f"raw_{slugify_identifier(Path(file_record.name).stem)}"
        storage_path = file_record.storage_path.replace("'", "''")
        if file_record.file_type == "csv":
            sql = f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_csv_auto('{storage_path}', union_by_name=true)"
        elif file_record.file_type == "json":
            sql = f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_json_auto('{storage_path}')"
        elif file_record.file_type == "parquet":
            sql = f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM parquet_scan('{storage_path}')"
        else:
            raise ValueError(f"Unsupported file type: {file_record.file_type}")
        conn.execute(sql)
        return view_name

    def register_delta_table(
        self,
        conn: duckdb.DuckDBPyConnection,
        table_record: DeltaTableModel,
        alias: str | None = None,
    ) -> str:
        view_name = alias or slugify_identifier(table_record.name)
        arrow_table = DeltaTable(table_record.storage_path).to_pyarrow_table()
        conn.register(view_name, arrow_table)
        return view_name

    def execute_query(
        self,
        sql: str,
        uploaded_files: list[UploadedFile],
        delta_tables: list[DeltaTableModel],
        limit: int | None = None,
    ) -> dict:
        conn = self.connect()
        try:
            registered_views = {"raw": {}, "curated": {}}
            for file_record in uploaded_files:
                view_name = self.register_uploaded_file(conn, file_record)
                registered_views["raw"][file_record.id] = view_name
            for table_record in delta_tables:
                view_name = self.register_delta_table(conn, table_record)
                registered_views["curated"][table_record.id] = view_name

            effective_sql = sql.strip().rstrip(";")
            if limit:
                effective_sql = f"SELECT * FROM ({effective_sql}) AS q LIMIT {limit}"

            started = perf_counter()
            relation = conn.execute(effective_sql)
            arrow_table = relation.fetch_arrow_table()
            execution_ms = int((perf_counter() - started) * 1000)
            rows = self._normalize_rows(arrow_table.to_pylist())
            return {
                "columns": arrow_table.column_names,
                "rows": rows,
                "row_count": len(rows),
                "execution_ms": execution_ms,
                "arrow_table": arrow_table,
                "registered_views": registered_views,
            }
        finally:
            conn.close()

    def preview_file(self, file_record: UploadedFile, limit: int = 20) -> dict:
        conn = self.connect()
        try:
            view_name = self.register_uploaded_file(conn, file_record, alias="preview_source")
            preview = conn.execute(f"SELECT * FROM {view_name} LIMIT {limit}").fetch_arrow_table()
            count = conn.execute(f"SELECT COUNT(*) AS total FROM {view_name}").fetchone()[0]
            schema = [{"name": field.name, "type": str(field.type)} for field in preview.schema]
            row_count = int(count)
            column_profiles = [
                self._profile_column(
                    conn,
                    view_name=view_name,
                    column_name=field["name"],
                    column_type=field["type"],
                    row_count=row_count,
                )
                for field in schema
            ]
            total_null_cells = sum(item["null_count"] for item in column_profiles)
            columns_with_nulls = sum(1 for item in column_profiles if item["null_count"] > 0)
            columns_with_blank_values = sum(1 for item in column_profiles if item["blank_count"] > 0)
            quality_indicators: list[str] = []
            if row_count == 0:
                quality_indicators.append("empty file")
            if columns_with_nulls == 0 and row_count > 0:
                quality_indicators.append("no missing values")
            if columns_with_blank_values > 0:
                quality_indicators.append("blank strings detected")
            if any(item["distinct_count"] <= 1 for item in column_profiles if row_count > 1):
                quality_indicators.append("constant columns present")
            if any(item["distinct_count"] == row_count for item in column_profiles if row_count > 1):
                quality_indicators.append("high-cardinality fields present")
            return {
                "columns": preview.column_names,
                "rows": self._normalize_rows(preview.to_pylist()),
                "row_count": row_count,
                "schema": schema,
                "profile_summary": {
                    "total_rows": row_count,
                    "total_columns": len(schema),
                    "null_cells": total_null_cells,
                    "columns_with_nulls": columns_with_nulls,
                    "columns_with_blank_values": columns_with_blank_values,
                    "quality_indicators": quality_indicators,
                },
                "column_profiles": column_profiles,
            }
        finally:
            conn.close()

    def preview_delta(self, table_record: DeltaTableModel, limit: int = 20) -> dict:
        delta_table = DeltaTable(table_record.storage_path)
        arrow_table = delta_table.to_pyarrow_table()
        sliced = arrow_table.slice(0, limit)
        return {
            "columns": sliced.column_names,
            "rows": self._normalize_rows(sliced.to_pylist()),
            "row_count": arrow_table.num_rows,
            "schema": [{"name": field.name, "type": str(field.type)} for field in arrow_table.schema],
        }

    def register_arrow(self, conn: duckdb.DuckDBPyConnection, name: str, table: pa.Table) -> None:
        conn.register(name, table)
