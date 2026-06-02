from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException

from app.db.session import get_db
from app.models.catalog import DeltaTable, UploadedFile
from app.models.notebook import NotebookDocument, NotebookRun
from app.schemas.engines import EngineCatalogResponse, NotebookExecutionRequest, NotebookExecutionResponse
from app.schemas.notebooks import (
    NotebookCellActionResponse,
    NotebookDetailResponse,
    NotebookDocumentCreateRequest,
    NotebookDocumentRead,
    NotebookDocumentUpdateRequest,
    NotebookListResponse,
    NotebookRunExecutionResponse,
)
from app.services.execution_engine_service import execution_engine_service


router = APIRouter(prefix="/engines", tags=["engines"])


@router.get("", response_model=EngineCatalogResponse)
def list_engines() -> EngineCatalogResponse:
    return EngineCatalogResponse(
        default_engine="duckdb",
        items=execution_engine_service.list_engines(),
    )


def _resolve_notebook_name(db: Session, proposed_name: str, exclude_id: str | None = None) -> str:
    base_name = proposed_name.strip() or "Untitled Notebook"
    candidate = base_name
    suffix = 2
    while True:
        query = db.query(NotebookDocument).filter(NotebookDocument.name == candidate)
        if exclude_id:
            query = query.filter(NotebookDocument.id != exclude_id)
        if query.one_or_none() is None:
            return candidate
        candidate = f"{base_name} ({suffix})"
        suffix += 1


@router.get("/notebooks", response_model=NotebookListResponse)
def list_notebooks(db: Session = Depends(get_db)) -> NotebookListResponse:
    items = db.query(NotebookDocument).order_by(desc(NotebookDocument.updated_at)).all()
    return NotebookListResponse(items=items)


@router.post("/notebooks", response_model=NotebookDocumentRead)
def create_notebook(payload: NotebookDocumentCreateRequest, db: Session = Depends(get_db)) -> NotebookDocumentRead:
    record = NotebookDocument(
        name=_resolve_notebook_name(db, payload.name),
        engine_id=payload.engine_id,
        description=payload.description,
        cells_json=[cell.model_dump() for cell in payload.cells_json],
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A notebook with this name already exists. Please try again.") from exc
    db.refresh(record)
    return record


@router.get("/notebooks/{notebook_id}", response_model=NotebookDetailResponse)
def get_notebook(notebook_id: str, db: Session = Depends(get_db)) -> NotebookDetailResponse:
    notebook = db.query(NotebookDocument).filter(NotebookDocument.id == notebook_id).one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    recent_runs = (
        db.query(NotebookRun)
        .filter(NotebookRun.notebook_id == notebook_id)
        .order_by(desc(NotebookRun.created_at))
        .limit(12)
        .all()
    )
    return NotebookDetailResponse(notebook=notebook, recent_runs=recent_runs)


@router.put("/notebooks/{notebook_id}", response_model=NotebookDocumentRead)
def update_notebook(
    notebook_id: str,
    payload: NotebookDocumentUpdateRequest,
    db: Session = Depends(get_db),
) -> NotebookDocumentRead:
    notebook = db.query(NotebookDocument).filter(NotebookDocument.id == notebook_id).one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    notebook.name = _resolve_notebook_name(db, payload.name, exclude_id=notebook_id)
    notebook.engine_id = payload.engine_id
    notebook.description = payload.description
    notebook.cells_json = [cell.model_dump() for cell in payload.cells_json]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A notebook with this name already exists. Please try again.") from exc
    db.refresh(notebook)
    return notebook


@router.post("/notebooks/{notebook_id}/run", response_model=NotebookRunExecutionResponse)
def run_saved_notebook(notebook_id: str, db: Session = Depends(get_db)) -> NotebookRunExecutionResponse:
    notebook = db.query(NotebookDocument).filter(NotebookDocument.id == notebook_id).one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    try:
        run, cell_results = execution_engine_service.execute_saved_notebook(
            notebook,
            db=db,
            uploaded_files=db.query(UploadedFile).all(),
            delta_tables=db.query(DeltaTable).all(),
            limit=200,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    db.refresh(notebook)
    return NotebookRunExecutionResponse(notebook=notebook, run=run, cell_results=cell_results)


@router.post("/notebooks/{notebook_id}/cells/{cell_id}/run", response_model=NotebookCellActionResponse)
def run_single_cell(notebook_id: str, cell_id: str, db: Session = Depends(get_db)) -> NotebookCellActionResponse:
    notebook = db.query(NotebookDocument).filter(NotebookDocument.id == notebook_id).one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    try:
        run, cell_results = execution_engine_service.execute_saved_notebook_range(
            notebook,
            db=db,
            uploaded_files=db.query(UploadedFile).all(),
            delta_tables=db.query(DeltaTable).all(),
            start_cell_id=cell_id,
            end_cell_id=cell_id,
            limit=200,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    db.refresh(notebook)
    return NotebookCellActionResponse(
        notebook=notebook,
        run=run,
        cell_results=cell_results,
        mode="single",
        start_cell_id=cell_id,
    )


@router.post("/notebooks/{notebook_id}/cells/{cell_id}/run-from-here", response_model=NotebookCellActionResponse)
def run_from_cell(notebook_id: str, cell_id: str, db: Session = Depends(get_db)) -> NotebookCellActionResponse:
    notebook = db.query(NotebookDocument).filter(NotebookDocument.id == notebook_id).one_or_none()
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    try:
        run, cell_results = execution_engine_service.execute_saved_notebook_range(
            notebook,
            db=db,
            uploaded_files=db.query(UploadedFile).all(),
            delta_tables=db.query(DeltaTable).all(),
            start_cell_id=cell_id,
            limit=200,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    db.refresh(notebook)
    return NotebookCellActionResponse(
        notebook=notebook,
        run=run,
        cell_results=cell_results,
        mode="from_here",
        start_cell_id=cell_id,
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
                db=db,
                limit=payload.limit,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
