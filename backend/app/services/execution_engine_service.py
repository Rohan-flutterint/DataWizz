from __future__ import annotations

import importlib.util
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from time import perf_counter
from typing import Any

import pandas as pd
import pyarrow as pa
from fastapi.encoders import jsonable_encoder

from app.core.config import get_settings
from app.models.catalog import DeltaTable as DeltaTableModel
from app.models.catalog import UploadedFile
from app.services.duckdb_service import DuckDBService
from app.utils.naming import slugify_identifier


class ExecutionEngineService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.duckdb_service = DuckDBService()
        self._spark_session: Any | None = None

    def list_engines(self) -> list[dict[str, Any]]:
        return [
            self._build_duckdb_descriptor(),
            self._build_spark_descriptor(),
            self._build_datafusion_descriptor(),
        ]

    def get_engine(self, engine_id: str) -> dict[str, Any]:
        engine = next((item for item in self.list_engines() if item["id"] == engine_id), None)
        if engine is None:
            raise ValueError(f"Unknown execution engine '{engine_id}'")
        return engine

    def execute_notebook(
        self,
        engine_id: str,
        code: str,
        uploaded_files: list[UploadedFile],
        delta_tables: list[DeltaTableModel],
        limit: int = 200,
    ) -> dict[str, Any]:
        engine = self.get_engine(engine_id)
        if not engine["available"]:
            raise ValueError(engine["availability_reason"] or f"{engine['label']} is not available in this environment.")

        context = self._build_source_context(uploaded_files, delta_tables)

        if engine_id == "duckdb":
            result = self.duckdb_service.execute_query(
                code,
                uploaded_files=uploaded_files,
                delta_tables=delta_tables,
                limit=limit,
            )
            return {
                "engine": engine,
                "result": {
                    "engine_id": engine["id"],
                    "engine_label": engine["label"],
                    "status": "success",
                    "language": engine["runtime_language"],
                    "execution_ms": result["execution_ms"],
                    "columns": result["columns"],
                    "rows": result["rows"],
                    "row_count": result["row_count"],
                    "stdout": None,
                    "message": f"Executed DuckDB SQL successfully with {len(context['raw_views'])} raw view(s) and {len(context['curated_views'])} curated table(s) registered.",
                    "warnings": [],
                    "metadata": {
                        **context,
                        "registered_views": result["registered_views"],
                    },
                },
            }

        if engine_id == "spark":
            return self._execute_spark_notebook(engine, code, uploaded_files, delta_tables, limit, context)

        if engine_id == "datafusion":
            return self._execute_datafusion_notebook(engine, code, uploaded_files, delta_tables, limit, context)

        raise ValueError(f"Execution for engine '{engine_id}' is not implemented.")

    def _build_duckdb_descriptor(self) -> dict[str, Any]:
        return {
            "id": "duckdb",
            "label": "DuckDB",
            "vendor": "DuckDB Labs",
            "runtime_language": "sql",
            "available": True,
            "status": "available",
            "summary": "Fast local SQL execution over files and Delta Lake tables.",
            "description": "Primary demo-ready engine for ad hoc SQL, file previewing, query exports, and Delta table publication.",
            "availability_reason": None,
            "supports_sql": True,
            "supports_python": False,
            "supports_delta_read": True,
            "supports_delta_write": True,
            "supports_local_files": True,
            "notebook_ready": True,
            "sample_code": "SELECT *\nFROM raw_sales\nLIMIT 25",
        }

    def _build_spark_descriptor(self) -> dict[str, Any]:
        pyspark_installed = self._module_available("pyspark")
        return {
            "id": "spark",
            "label": "Spark Notebook",
            "vendor": "Apache Spark",
            "runtime_language": "python",
            "available": pyspark_installed,
            "status": "available" if pyspark_installed else "not_installed",
            "summary": "PySpark-style notebook execution for distributed transformation logic.",
            "description": "Use Python notebook cells with Spark SQL or DataFrame APIs, similar to a Databricks Spark notebook workflow.",
            "availability_reason": None if pyspark_installed else "PySpark is not installed in this local environment yet. Install pyspark to enable live Spark notebook execution.",
            "supports_sql": True,
            "supports_python": True,
            "supports_delta_read": False,
            "supports_delta_write": False,
            "supports_local_files": True,
            "notebook_ready": pyspark_installed,
            "sample_code": (
                "result = spark.sql(\"\"\"\n"
                "SELECT region, SUM(revenue) AS total_revenue\n"
                "FROM raw_sales\n"
                "GROUP BY region\n"
                "ORDER BY total_revenue DESC\n"
                "\"\"\")\n"
                "print('Spark query complete')"
            ),
        }

    def _build_datafusion_descriptor(self) -> dict[str, Any]:
        datafusion_installed = self._module_available("datafusion")
        return {
            "id": "datafusion",
            "label": "DataFusion Notebook",
            "vendor": "Apache Arrow DataFusion",
            "runtime_language": "python",
            "available": datafusion_installed,
            "status": "available" if datafusion_installed else "not_installed",
            "summary": "Arrow-native Python notebook runtime for SQL and dataframe experiments.",
            "description": "Experimental notebook surface for Apache DataFusion when the Python runtime is installed locally.",
            "availability_reason": None if datafusion_installed else "The Python DataFusion runtime is not installed. Install the datafusion package to enable live notebook execution.",
            "supports_sql": True,
            "supports_python": True,
            "supports_delta_read": False,
            "supports_delta_write": False,
            "supports_local_files": True,
            "notebook_ready": datafusion_installed,
            "sample_code": (
                "result = ctx.sql(\"\"\"\n"
                "SELECT product_category, SUM(revenue) AS total_revenue\n"
                "FROM raw_sales\n"
                "GROUP BY product_category\n"
                "ORDER BY total_revenue DESC\n"
                "\"\"\")\n"
                "print('DataFusion query complete')"
            ),
        }

    def _build_source_context(
        self,
        uploaded_files: list[UploadedFile],
        delta_tables: list[DeltaTableModel],
    ) -> dict[str, Any]:
        raw_views = [f"raw_{slugify_identifier(Path(file_record.name).stem)}" for file_record in uploaded_files]
        curated_views = [slugify_identifier(table_record.name) for table_record in delta_tables]
        return {
            "raw_views": raw_views,
            "curated_views": curated_views,
            "raw_sources": [
                {
                    "id": file_record.id,
                    "name": file_record.name,
                    "view_name": f"raw_{slugify_identifier(Path(file_record.name).stem)}",
                    "path": file_record.storage_path,
                    "file_type": file_record.file_type,
                }
                for file_record in uploaded_files
            ],
            "curated_sources": [
                {
                    "id": table_record.id,
                    "name": table_record.name,
                    "view_name": slugify_identifier(table_record.name),
                    "path": table_record.storage_path,
                    "schema_name": table_record.schema_name,
                }
                for table_record in delta_tables
            ],
        }

    def _execute_spark_notebook(
        self,
        engine: dict[str, Any],
        code: str,
        uploaded_files: list[UploadedFile],
        delta_tables: list[DeltaTableModel],
        limit: int,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        from pyspark.sql import SparkSession

        spark = self._get_or_create_spark_session(SparkSession)
        warnings: list[str] = []

        for file_record in uploaded_files:
            view_name = f"raw_{slugify_identifier(Path(file_record.name).stem)}"
            dataframe = self._read_file_with_spark(spark, file_record)
            dataframe.createOrReplaceTempView(view_name)

        for table_record in delta_tables:
            warnings.append(
                f"Curated Delta table '{table_record.name}' was not auto-registered for Spark because Delta Lake Spark bindings are not configured in this demo runtime."
            )

        namespace = {
            "spark": spark,
            "source_catalog": context,
            "raw_views": context["raw_views"],
            "curated_views": context["curated_views"],
            "result": None,
        }
        return self._execute_python_notebook(engine, code, namespace, limit, context, warnings)

    def _execute_datafusion_notebook(
        self,
        engine: dict[str, Any],
        code: str,
        uploaded_files: list[UploadedFile],
        delta_tables: list[DeltaTableModel],
        limit: int,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        from datafusion import SessionContext

        ctx = SessionContext()
        warnings: list[str] = []

        for file_record in uploaded_files:
            view_name = f"raw_{slugify_identifier(Path(file_record.name).stem)}"
            path = file_record.storage_path
            if file_record.file_type == "csv":
                ctx.register_csv(view_name, path)
            elif file_record.file_type == "parquet":
                ctx.register_parquet(view_name, path)
            else:
                warnings.append(
                    f"DataFusion auto-registration currently skips {file_record.file_type.upper()} source '{file_record.name}'."
                )

        for table_record in delta_tables:
            warnings.append(
                f"Curated Delta table '{table_record.name}' was not auto-registered for DataFusion in the current runtime."
            )

        namespace = {
            "ctx": ctx,
            "source_catalog": context,
            "raw_views": context["raw_views"],
            "curated_views": context["curated_views"],
            "result": None,
        }
        return self._execute_python_notebook(engine, code, namespace, limit, context, warnings)

    def _execute_python_notebook(
        self,
        engine: dict[str, Any],
        code: str,
        namespace: dict[str, Any],
        limit: int,
        context: dict[str, Any],
        warnings: list[str],
    ) -> dict[str, Any]:
        stdout_buffer = StringIO()
        started = perf_counter()
        with redirect_stdout(stdout_buffer):
            exec(compile(code, f"{engine['id']}_notebook.py", "exec"), namespace, namespace)
        execution_ms = int((perf_counter() - started) * 1000)

        normalized = self._normalize_python_result(namespace.get("result"), limit)
        return {
            "engine": engine,
            "result": {
                "engine_id": engine["id"],
                "engine_label": engine["label"],
                "status": "success",
                "language": engine["runtime_language"],
                "execution_ms": execution_ms,
                "columns": normalized["columns"],
                "rows": normalized["rows"],
                "row_count": normalized["row_count"],
                "stdout": stdout_buffer.getvalue().strip() or None,
                "message": normalized["message"] or "Notebook cell executed successfully.",
                "warnings": warnings,
                "metadata": context,
            },
        }

    def _normalize_python_result(self, result: Any, limit: int) -> dict[str, Any]:
        if result is None:
            return {
                "columns": [],
                "rows": [],
                "row_count": 0,
                "message": "Execution completed. Assign a table-like object to `result` to preview rows in the notebook output.",
            }

        if isinstance(result, pa.Table):
            sliced = result.slice(0, limit)
            rows = jsonable_encoder(sliced.to_pylist())
            return {
                "columns": sliced.column_names,
                "rows": rows,
                "row_count": result.num_rows,
                "message": f"Previewing {len(rows)} of {result.num_rows} row(s) returned by the notebook cell.",
            }

        if isinstance(result, pd.DataFrame):
            preview = result.head(limit)
            rows = jsonable_encoder(preview.to_dict(orient="records"))
            return {
                "columns": list(preview.columns),
                "rows": rows,
                "row_count": len(result.index),
                "message": f"Previewing {len(rows)} of {len(result.index)} row(s) returned by the notebook cell.",
            }

        if hasattr(result, "limit") and hasattr(result, "toPandas"):
            preview_df = result.limit(limit).toPandas()
            try:
                row_count = int(result.count())
            except Exception:  # noqa: BLE001
                row_count = len(preview_df.index)
            rows = jsonable_encoder(preview_df.to_dict(orient="records"))
            return {
                "columns": list(preview_df.columns),
                "rows": rows,
                "row_count": row_count,
                "message": f"Previewing Spark result rows ({len(rows)} shown).",
            }

        if hasattr(result, "to_pandas"):
            preview_df = result.to_pandas()
            if hasattr(preview_df, "head"):
                preview_df = preview_df.head(limit)
                rows = jsonable_encoder(preview_df.to_dict(orient="records"))
                return {
                    "columns": list(preview_df.columns),
                    "rows": rows,
                    "row_count": len(rows),
                    "message": f"Previewing DataFusion result rows ({len(rows)} shown).",
                }

        if isinstance(result, list):
            if result and isinstance(result[0], dict):
                rows = jsonable_encoder(result[:limit])
                return {
                    "columns": list(rows[0].keys()) if rows else [],
                    "rows": rows,
                    "row_count": len(result),
                    "message": f"Previewing {len(rows)} of {len(result)} row(s) returned by the notebook cell.",
                }
            rows = jsonable_encoder([{"value": item} for item in result[:limit]])
            return {
                "columns": ["value"],
                "rows": rows,
                "row_count": len(result),
                "message": f"Previewing {len(rows)} of {len(result)} list item(s) returned by the notebook cell.",
            }

        if isinstance(result, dict):
            row = jsonable_encoder(result)
            return {
                "columns": list(row.keys()),
                "rows": [row],
                "row_count": 1,
                "message": "Previewing a single dictionary result from the notebook cell.",
            }

        return {
            "columns": [],
            "rows": [],
            "row_count": 0,
            "message": f"Notebook cell returned a {type(result).__name__}. Inspect stdout or assign a dataframe-like object to `result` for row previews.",
        }

    def _get_or_create_spark_session(self, spark_session_class: Any) -> Any:
        if self._spark_session is None:
            self._spark_session = (
                spark_session_class.builder.master("local[*]")
                .appName("DataWizz Engine Lab")
                .config("spark.ui.enabled", "false")
                .getOrCreate()
            )
        return self._spark_session

    def _read_file_with_spark(self, spark: Any, file_record: UploadedFile) -> Any:
        path = file_record.storage_path
        if file_record.file_type == "csv":
            return spark.read.option("header", True).option("inferSchema", True).csv(path)
        if file_record.file_type == "json":
            return spark.read.json(path)
        if file_record.file_type == "parquet":
            return spark.read.parquet(path)
        raise ValueError(f"Spark does not support auto-registering file type '{file_record.file_type}'.")

    def _module_available(self, module_name: str) -> bool:
        return importlib.util.find_spec(module_name) is not None


execution_engine_service = ExecutionEngineService()
