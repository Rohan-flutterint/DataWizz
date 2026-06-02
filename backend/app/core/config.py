from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Internal Lakehouse Platform API"
    api_prefix: str = "/api"
    debug: bool = True

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/lakehouse"
    raw_storage_path: str = str(ROOT_DIR / "storage" / "raw")
    curated_storage_path: str = str(ROOT_DIR / "storage" / "curated")
    temp_storage_path: str = str(ROOT_DIR / "storage" / "temp")

    minio_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "lakehouse"
    execution_engine: str = "duckdb"
    query_preview_limit: int = 200
    allow_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    superset_url: str = "http://localhost:8088"
    superset_username: str = "admin"
    superset_password: str = "admin"
    scheduler_enabled: bool = True
    scheduler_poll_interval_seconds: int = 30
    scheduler_timezone: str = "Asia/Kolkata"


@lru_cache
def get_settings() -> Settings:
    return Settings()
