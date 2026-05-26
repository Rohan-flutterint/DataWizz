from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Pipeline(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pipelines"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    definition_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    schedule_cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)


class PipelineRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pipeline_runs"

    pipeline_id: Mapped[str] = mapped_column(ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class JobLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "job_logs"

    pipeline_run_id: Mapped[str | None] = mapped_column(ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=True)
    query_id: Mapped[str | None] = mapped_column(ForeignKey("queries.id", ondelete="SET NULL"), nullable=True)
    level: Mapped[str] = mapped_column(String(16), default="INFO", nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
