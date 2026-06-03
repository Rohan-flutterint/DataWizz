from io import BytesIO

import pyarrow.csv as pacsv
import pyarrow.parquet as pq
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.catalog import DeltaTable, QueryHistory, UploadedFile
from app.schemas.queries import (
    QueryExecuteRequest,
    QueryExecuteResponse,
    QueryExportRequest,
    QueryHistoryListResponse,
    WriteDeltaResponse,
    WriteDeltaRequest,
)
from app.services.delta_service import DeltaService
from app.services.duckdb_service import DuckDBService
from app.utils.naming import slugify_identifier


router = APIRouter(prefix="/queries", tags=["queries"])
duckdb_service = DuckDBService()
delta_service = DeltaService()


def _run_query_for_payload(db: Session, sql: str, limit: int | None = None) -> dict:
    return duckdb_service.execute_query(
        sql,
        uploaded_files=db.query(UploadedFile).all(),
        delta_tables=db.query(DeltaTable).all(),
        limit=limit,
    )


@router.get("/history", response_model=QueryHistoryListResponse)
def list_query_history(db: Session = Depends(get_db)) -> QueryHistoryListResponse:
    items = db.query(QueryHistory).order_by(QueryHistory.created_at.desc()).limit(50).all()
    return QueryHistoryListResponse(items=items)


@router.post("/execute", response_model=QueryExecuteResponse, dependencies=[Depends(require_roles("admin", "analyst"))])
def execute_query(payload: QueryExecuteRequest, db: Session = Depends(get_db)) -> QueryExecuteResponse:
    try:
        result = _run_query_for_payload(db, payload.sql, payload.limit)
        query = QueryHistory(
            name=payload.name,
            sql_text=payload.sql,
            status="success",
            execution_ms=result["execution_ms"],
            row_count=result["row_count"],
            result_preview=result["rows"][:20],
        )
        db.add(query)
        db.commit()
        db.refresh(query)
        return QueryExecuteResponse(query=query, result=result)
    except Exception as exc:
        query = QueryHistory(
            name=payload.name,
            sql_text=payload.sql,
            status="failed",
            error_message=str(exc),
        )
        db.add(query)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/export", dependencies=[Depends(require_roles("admin", "analyst"))])
def export_query(payload: QueryExportRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    try:
        result = _run_query_for_payload(db, payload.sql, None)
        arrow_table = result["arrow_table"]
        safe_name = slugify_identifier(payload.file_name or "query_result")

        if payload.format == "csv":
            output = BytesIO()
            pacsv.write_csv(arrow_table, output)
            output.seek(0)
            return StreamingResponse(
                output,
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
            )

        output = BytesIO()
        pq.write_table(arrow_table, output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.parquet"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/write-delta", response_model=WriteDeltaResponse, dependencies=[Depends(require_roles("admin", "analyst"))])
def write_delta(payload: WriteDeltaRequest, db: Session = Depends(get_db)) -> WriteDeltaResponse:
    result = _run_query_for_payload(db, payload.sql, None)
    table = delta_service.write_table(
        db,
        table_name=payload.table_name,
        arrow_table=result["arrow_table"],
        mode=payload.mode,
        schema_name=payload.schema_name,
        description=payload.description,
        source_query=payload.sql,
    )
    return WriteDeltaResponse(message="Delta table written successfully", table=table)
