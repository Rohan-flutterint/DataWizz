from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.catalog import DeltaTable, UploadedFile
from app.schemas.engines import EngineCatalogResponse, NotebookExecutionRequest, NotebookExecutionResponse
from app.services.execution_engine_service import execution_engine_service


router = APIRouter(prefix="/engines", tags=["engines"])


@router.get("", response_model=EngineCatalogResponse)
def list_engines() -> EngineCatalogResponse:
    return EngineCatalogResponse(
        default_engine="duckdb",
        items=execution_engine_service.list_engines(),
    )


@router.post("/notebooks/execute", response_model=NotebookExecutionResponse)
def execute_notebook(payload: NotebookExecutionRequest, db: Session = Depends(get_db)) -> NotebookExecutionResponse:
    try:
        return NotebookExecutionResponse.model_validate(
            execution_engine_service.execute_notebook(
                engine_id=payload.engine_id,
                code=payload.code,
                uploaded_files=db.query(UploadedFile).all(),
                delta_tables=db.query(DeltaTable).all(),
                limit=payload.limit,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
