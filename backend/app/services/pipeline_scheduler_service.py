import asyncio
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from croniter import croniter
from sqlalchemy import desc

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.pipeline import Pipeline, PipelineRun
from app.services.pipeline_service import PipelineService


class PipelineSchedulerService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.pipeline_service = PipelineService()
        self.timezone = ZoneInfo(self.settings.scheduler_timezone)
        self._task: asyncio.Task | None = None
        self._stop_event: asyncio.Event | None = None
        self._running = False
        self._last_tick_at: datetime | None = None
        self._last_error: str | None = None
        self._last_summary: dict[str, Any] = {
            "checked": 0,
            "triggered": [],
            "invalid_schedules": [],
            "next_due": [],
        }

    @property
    def enabled(self) -> bool:
        return bool(self.settings.scheduler_enabled)

    @property
    def poll_interval_seconds(self) -> int:
        return max(int(self.settings.scheduler_poll_interval_seconds), 5)

    async def start(self) -> None:
        if not self.enabled or self._task is not None:
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="pipeline-scheduler")
        self._running = True

    async def stop(self) -> None:
        if self._task is None:
            return
        if self._stop_event is not None:
            self._stop_event.set()
        await self._task
        self._task = None
        self._stop_event = None
        self._running = False

    async def _run_loop(self) -> None:
        while self._stop_event is not None and not self._stop_event.is_set():
            try:
                self.run_due_pipelines_once()
            except Exception as exc:  # noqa: BLE001
                self._last_error = str(exc)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
            except TimeoutError:
                continue
        self._running = False

    def _compute_due(
        self,
        pipeline: Pipeline,
        last_scheduled_run: PipelineRun | None,
        *,
        now_local: datetime,
    ) -> tuple[bool, datetime | None]:
        cron = (pipeline.schedule_cron or "").strip()
        if not cron or not croniter.is_valid(cron):
            return False, None

        reference_utc = (
            last_scheduled_run.started_at
            if last_scheduled_run and last_scheduled_run.started_at is not None
            else pipeline.updated_at or pipeline.created_at or datetime.now(timezone.utc)
        )
        if reference_utc.tzinfo is None:
            reference_utc = reference_utc.replace(tzinfo=timezone.utc)
        reference_local = reference_utc.astimezone(self.timezone)
        next_run_local = croniter(cron, reference_local).get_next(datetime)
        return next_run_local <= now_local, next_run_local

    def compute_next_run_at(self, pipeline: Pipeline, last_scheduled_run: PipelineRun | None) -> datetime | None:
        now_local = datetime.now(timezone.utc).astimezone(self.timezone)
        _, next_run_local = self._compute_due(pipeline, last_scheduled_run, now_local=now_local)
        if next_run_local is None:
            return None
        return next_run_local.astimezone(timezone.utc)

    def run_due_pipelines_once(self) -> dict[str, Any]:
        summary: dict[str, Any] = {
            "checked": 0,
            "triggered": [],
            "invalid_schedules": [],
            "next_due": [],
        }
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc.astimezone(self.timezone)

        with SessionLocal() as db:
            pipelines = (
                db.query(Pipeline)
                .filter(Pipeline.schedule_cron.is_not(None))
                .filter(Pipeline.schedule_cron != "")
                .filter(Pipeline.status == "active")
                .order_by(Pipeline.updated_at.desc())
                .all()
            )
            summary["checked"] = len(pipelines)

            for pipeline in pipelines:
                cron = (pipeline.schedule_cron or "").strip()
                if not cron:
                    continue
                if not croniter.is_valid(cron):
                    summary["invalid_schedules"].append(
                        {
                            "pipeline_id": pipeline.id,
                            "pipeline_name": pipeline.name,
                            "cron": cron,
                            "reason": "Invalid cron expression",
                        }
                    )
                    continue

                last_scheduled_run = (
                    db.query(PipelineRun)
                    .filter(PipelineRun.pipeline_id == pipeline.id)
                    .filter(PipelineRun.trigger_type == "scheduled")
                    .order_by(desc(PipelineRun.started_at), desc(PipelineRun.created_at))
                    .first()
                )
                due, next_run_local = self._compute_due(pipeline, last_scheduled_run, now_local=now_local)
                if next_run_local is not None:
                    summary["next_due"].append(
                        {
                            "pipeline_id": pipeline.id,
                            "pipeline_name": pipeline.name,
                            "cron": cron,
                            "next_run_at": next_run_local.astimezone(timezone.utc).isoformat(),
                        }
                    )

                if not due:
                    continue

                run = self.pipeline_service.execute_pipeline(db, pipeline, trigger_type="scheduled")
                self.pipeline_service.create_log(
                    db,
                    run_id=run.id,
                    level="INFO",
                    source="scheduler",
                    message=f"Triggered scheduled run for {pipeline.name}",
                    status=run.status,
                    context_json={
                        "pipeline_id": pipeline.id,
                        "pipeline_name": pipeline.name,
                        "cron": cron,
                        "triggered_at": now_utc.isoformat(),
                    },
                )
                summary["triggered"].append(
                    {
                        "pipeline_id": pipeline.id,
                        "pipeline_name": pipeline.name,
                        "run_id": run.id,
                        "status": run.status,
                    }
                )

        summary["next_due"] = sorted(summary["next_due"], key=lambda item: item["next_run_at"])[:10]
        self._last_tick_at = now_utc
        self._last_error = None
        self._last_summary = summary
        return summary

    def get_status(self) -> dict[str, Any]:
        managed_pipeline_count = 0
        with SessionLocal() as db:
            managed_pipeline_count = (
                db.query(Pipeline)
                .filter(Pipeline.schedule_cron.is_not(None))
                .filter(Pipeline.schedule_cron != "")
                .filter(Pipeline.status == "active")
                .count()
            )

        return {
            "enabled": self.enabled,
            "running": self._running,
            "timezone": self.settings.scheduler_timezone,
            "poll_interval_seconds": self.poll_interval_seconds,
            "last_tick_at": self._last_tick_at.isoformat() if self._last_tick_at else None,
            "last_error": self._last_error,
            "managed_pipeline_count": managed_pipeline_count,
            "last_summary": self._last_summary,
        }


pipeline_scheduler_service = PipelineSchedulerService()
