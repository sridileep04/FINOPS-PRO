from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

import time
from celery.signals import task_prerun, task_postrun, task_failure
from prometheus_client import Counter, Histogram

celery_app = Celery(
    "finops",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.report_tasks", "app.tasks.scan_tasks","app.tasks.pricing_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=settings.STEAMPIPE_CLIENT_TIMEOUT_SECONDS + 60,
    task_soft_time_limit=settings.STEAMPIPE_CLIENT_TIMEOUT_SECONDS + 30,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    beat_schedule={
        # Nightly full sweep: inventory + CPU metrics + daily costs for
        # every validated account, followed by rightsizing / orphan /
        # security / anomaly / night-shutdown analysis on the fresh data.
        "nightly-account-scan": {
            "task": "scans.run_all_accounts",
            "schedule": crontab(hour=2, minute=0),  # 02:00 UTC daily
        },
        "daily-pricing-refresh": {
        "task": "pricing.refresh_cache",
        "schedule": crontab(hour=1, minute=0),  # change to crontab(day_of_week=1, hour=1, minute=0) for weekly instead
        },
    },
)

celery_task_duration_seconds = Histogram("celery_task_duration_seconds", "Task duration", ["task_name"])
celery_task_failures_total = Counter("celery_task_failures_total", "Task failures", ["task_name"])
_task_start_times: dict[str, float] = {}

@task_prerun.connect
def _on_prerun(task_id, task, **kwargs):
    _task_start_times[task_id] = time.monotonic()

@task_postrun.connect
def _on_postrun(task_id, task, **kwargs):
    start = _task_start_times.pop(task_id, None)
    if start:
        celery_task_duration_seconds.labels(task_name=task.name).observe(time.monotonic() - start)

@task_failure.connect
def _on_failure(sender, **kwargs):
    celery_task_failures_total.labels(task_name=sender.name).inc()
