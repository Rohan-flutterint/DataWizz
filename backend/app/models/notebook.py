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


class NotebookRevision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notebook_revisions"

    notebook_id: Mapped[str] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False, default="save")
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


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


class NotebookArtifact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notebook_artifacts"

    notebook_id: Mapped[str] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False)
    notebook_run_id: Mapped[str | None] = mapped_column(ForeignKey("notebook_runs.id", ondelete="SET NULL"), nullable=True)
    delta_table_id: Mapped[str | None] = mapped_column(ForeignKey("delta_tables.id", ondelete="SET NULL"), nullable=True)
    cell_id: Mapped[str] = mapped_column(String(255), nullable=False)
    cell_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artifact_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    download_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class NotebookSnippet(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notebook_snippets"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    engine_scope: Mapped[str] = mapped_column(String(64), nullable=False, default="all")
    cell_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="code")
    code: Mapped[str] = mapped_column(Text, nullable=False)
    is_template: Mapped[bool] = mapped_column(default=False, nullable=False)
