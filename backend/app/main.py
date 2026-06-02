from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import bi, engines, files, pipelines, queries, system, tables
from app.core.config import get_settings
from app.db.base import *  # noqa: F403
from app.db.session import Base, engine
from app.services.pipeline_scheduler_service import pipeline_scheduler_service
from app.services.storage import StorageService


settings = get_settings()
storage_service = StorageService()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    storage_service.ensure_directories()
    Base.metadata.create_all(bind=engine)
    await pipeline_scheduler_service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await pipeline_scheduler_service.stop()


app.include_router(system.router, prefix=settings.api_prefix)
app.include_router(engines.router, prefix=settings.api_prefix)
app.include_router(files.router, prefix=settings.api_prefix)
app.include_router(queries.router, prefix=settings.api_prefix)
app.include_router(tables.router, prefix=settings.api_prefix)
app.include_router(pipelines.router, prefix=settings.api_prefix)
app.include_router(bi.router, prefix=settings.api_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
