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
            return {
                "columns": preview.column_names,
                "rows": self._normalize_rows(preview.to_pylist()),
                "row_count": int(count),
                "schema": schema,
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
