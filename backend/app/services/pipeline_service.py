from collections import defaultdict
from datetime import datetime, timezone
from time import perf_counter

import networkx as nx
from sqlalchemy.orm import Session

from app.models.catalog import DeltaTable, UploadedFile
from app.models.pipeline import JobLog, Pipeline, PipelineRun
from app.services.delta_service import DeltaService
from app.services.duckdb_service import DuckDBService
from app.utils.naming import slugify_identifier


class PipelineService:
    def __init__(self) -> None:
        self.duckdb_service = DuckDBService()
        self.delta_service = DeltaService()

    def _require_config(self, data: dict, key: str, node_id: str, node_type: str) -> str:
        value = data.get(key)
        if value in (None, "", []):
            raise ValueError(
                f"Node {node_id} ({node_type}) is missing required config `{key}`. Open the pipeline builder and complete this field."
            )
        return str(value)

    def validate_definition(self, definition: dict) -> tuple[bool, list[str], list[str]]:
        graph = nx.DiGraph()
        issues: list[str] = []
        for node in definition.get("nodes", []):
            graph.add_node(node["id"], **node)
        for edge in definition.get("edges", []):
            graph.add_edge(edge["source"], edge["target"])

        if not nx.is_directed_acyclic_graph(graph):
            issues.append("Pipeline graph must be a directed acyclic graph.")
            return False, [], issues

        for node in definition.get("nodes", []):
            if node["type"] in {"filter", "select", "sql", "validate", "writeDelta"} and graph.in_degree(node["id"]) == 0:
                issues.append(f"Node {node['id']} requires an upstream input.")

        return len(issues) == 0, list(nx.topological_sort(graph)), issues

    def create_log(
        self,
        db: Session,
        *,
        run_id: str | None,
        level: str,
        source: str,
        message: str,
        status: str | None = None,
        context_json: dict | None = None,
    ) -> JobLog:
        log = JobLog(
            pipeline_run_id=run_id,
            level=level,
            source=source,
            message=message,
            status=status,
            context_json=context_json,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    def execute_pipeline(self, db: Session, pipeline: Pipeline) -> PipelineRun:
        valid, ordered_nodes, issues = self.validate_definition(pipeline.definition_json)
        run = PipelineRun(
            pipeline_id=pipeline.id,
            status="pending",
            started_at=datetime.now(timezone.utc),
            trigger_type="manual",
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        if not valid:
            run.status = "failed"
            run.error_message = "; ".join(issues)
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            self.create_log(db, run_id=run.id, level="ERROR", source="pipeline", message=run.error_message, status="failed")
            return run

        conn = self.duckdb_service.connect()
        started = perf_counter()
        run.status = "running"
        db.commit()

        uploaded_files = {record.id: record for record in db.query(UploadedFile).all()}
        delta_tables = {record.id: record for record in db.query(DeltaTable).all()}
        graph_inputs: dict[str, list[str]] = defaultdict(list)
        for edge in pipeline.definition_json.get("edges", []):
            graph_inputs[edge["target"]].append(edge["source"])

        view_names: dict[str, str] = {}
        current_node_id: str | None = None
        current_node_type: str | None = None

        try:
            for node_id in ordered_nodes:
                node = next(item for item in pipeline.definition_json["nodes"] if item["id"] == node_id)
                node_type = node["type"]
                current_node_id = node_id
                current_node_type = node_type
                data = node.get("data", {})
                config = data.get("config", data) if isinstance(data, dict) else {}
                view_name = slugify_identifier(f"node_{node_id}")

                if node_type == "fileSource":
                    file_id = self._require_config(config, "fileId", node_id, node_type)
                    file_record = uploaded_files.get(file_id)
                    if file_record is None:
                        raise ValueError(f"Node {node_id} ({node_type}) references file `{file_id}`, but it no longer exists.")
                    self.duckdb_service.register_uploaded_file(conn, file_record, alias=view_name)
                    view_names[node_id] = view_name
                    self.create_log(
                        db,
                        run_id=run.id,
                        level="INFO",
                        source=node_type,
                        message=f"Loaded file {file_record.name}",
                        status="success",
                        context_json={"node_id": node_id, "view_name": view_name, "file_id": file_id},
                    )
                    continue

                if node_type == "deltaSource":
                    table_id = self._require_config(config, "tableId", node_id, node_type)
                    table_record = delta_tables.get(table_id)
                    if table_record is None:
                        raise ValueError(f"Node {node_id} ({node_type}) references Delta table `{table_id}`, but it no longer exists.")
                    self.duckdb_service.register_delta_table(conn, table_record, alias=view_name)
                    view_names[node_id] = view_name
                    self.create_log(
                        db,
                        run_id=run.id,
                        level="INFO",
                        source=node_type,
                        message=f"Loaded delta table {table_record.name}",
                        status="success",
                        context_json={"node_id": node_id, "view_name": view_name, "table_id": table_id},
                    )
                    continue

                input_nodes = graph_inputs[node_id]
                input_views = [view_names[source_node] for source_node in input_nodes if source_node in view_names]
                if not input_views and node_type not in {"schedule"}:
                    raise ValueError(f"Node {node_id} has no available inputs.")

                if node_type == "filter":
                    condition = config.get("condition", "1=1")
                    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM {input_views[0]} WHERE {condition}")
                elif node_type == "select":
                    columns = config.get("columns") or ["*"]
                    projection = ", ".join(columns)
                    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT {projection} FROM {input_views[0]}")
                elif node_type == "join":
                    if len(input_views) < 2:
                        raise ValueError("Join node requires two upstream datasets.")
                    join_type = config.get("joinType", "inner")
                    left_key = self._require_config(config, "leftKey", node_id, node_type)
                    right_key = self._require_config(config, "rightKey", node_id, node_type)
                    conn.execute(
                        f"""
                        CREATE OR REPLACE VIEW {view_name} AS
                        SELECT *
                        FROM {input_views[0]} AS left_side
                        {join_type.upper()} JOIN {input_views[1]} AS right_side
                        ON left_side.{left_key} = right_side.{right_key}
                        """
                    )
                elif node_type == "aggregate":
                    group_by = config.get("groupBy") or []
                    metrics = config.get("metrics") or [{"agg": "count", "column": "*", "alias": "row_count"}]
                    metrics_sql = ", ".join(
                        f"{metric['agg'].upper()}({metric['column']}) AS {metric['alias']}" for metric in metrics
                    )
                    group_sql = ", ".join(group_by)
                    if group_sql:
                        sql = f"CREATE OR REPLACE VIEW {view_name} AS SELECT {group_sql}, {metrics_sql} FROM {input_views[0]} GROUP BY {group_sql}"
                    else:
                        sql = f"CREATE OR REPLACE VIEW {view_name} AS SELECT {metrics_sql} FROM {input_views[0]}"
                    conn.execute(sql)
                elif node_type == "sql":
                    sql = config.get("sql", "SELECT * FROM input_1")
                    for index, input_view in enumerate(input_views, start=1):
                        sql = sql.replace(f"{{{{input_{index}}}}}", input_view)
                    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS {sql}")
                elif node_type == "validate":
                    min_rows = int(config.get("minRows", 1))
                    count = conn.execute(f"SELECT COUNT(*) FROM {input_views[0]}").fetchone()[0]
                    if count < min_rows:
                        raise ValueError(f"Validation failed for {node_id}: expected at least {min_rows} rows, got {count}.")
                    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM {input_views[0]}")
                elif node_type == "writeDelta":
                    final_view = input_views[0]
                    table_name = self._require_config(config, "tableName", node_id, node_type)
                    mode = config.get("mode", "overwrite")
                    arrow_table = conn.execute(f"SELECT * FROM {final_view}").fetch_arrow_table()
                    written = self.delta_service.write_table(
                        db,
                        table_name=table_name,
                        arrow_table=arrow_table,
                        mode=mode,
                        schema_name=config.get("schemaName", "analytics"),
                        description=config.get("description"),
                        source_query=f"Pipeline {pipeline.name} node {node_id}",
                    )
                    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM {final_view}")
                    self.create_log(
                        db,
                        run_id=run.id,
                        level="INFO",
                        source=node_type,
                        message=f"Wrote Delta table {written.name}",
                        status="success",
                        context_json={"node_id": node_id, "table_name": written.name, "view_name": view_name},
                    )
                elif node_type == "schedule":
                    self.create_log(
                        db,
                        run_id=run.id,
                        level="INFO",
                        source=node_type,
                        message="Schedule metadata captured",
                        status="success",
                        context_json={"node_id": node_id, "cron": config.get("cron")},
                    )
                    continue
                else:
                    raise ValueError(f"Unsupported node type: {node_type}")

                view_names[node_id] = view_name
                self.create_log(
                    db,
                    run_id=run.id,
                    level="INFO",
                    source=node_type,
                    message=f"Executed node {node_id}",
                    status="success",
                    context_json={"node_id": node_id, "view_name": view_name},
                )

            run.status = "success"
            run.finished_at = datetime.now(timezone.utc)
            run.duration_ms = int((perf_counter() - started) * 1000)
            run.run_summary = {"ordered_nodes": ordered_nodes, "completed_nodes": list(view_names.keys())}
            db.commit()
            return run
        except Exception as exc:
            run.status = "failed"
            run.error_message = str(exc)
            run.finished_at = datetime.now(timezone.utc)
            run.duration_ms = int((perf_counter() - started) * 1000)
            db.commit()
            self.create_log(
                db,
                run_id=run.id,
                level="ERROR",
                source=current_node_type or "pipeline",
                message=str(exc),
                status="failed",
                context_json={"node_id": current_node_id} if current_node_id else None,
            )
            return run
        finally:
            conn.close()
