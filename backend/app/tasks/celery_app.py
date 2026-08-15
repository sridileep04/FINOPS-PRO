from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "finops",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.report_tasks", "app.tasks.scan_tasks"],
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
    },
)
