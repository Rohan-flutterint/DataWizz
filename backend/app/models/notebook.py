from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class NotebookDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notebooks"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    engine_id: Mapped[str] = mapped_column(String(64), nullable=False, default="duckdb")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cells_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    latest_cell_results_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotebookRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notebook_runs"

    notebook_id: Mapped[str] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False)
    engine_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
