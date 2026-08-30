#!/bin/sh
# Shared entrypoint for the backend image -- used for the API service,
# and (via a different CMD passed at `docker run`/compose time) for the
# Celery worker/beat services too, so all three run from one built image
# instead of maintaining three near-identical Dockerfiles.
set -eu

case "${1:-uvicorn-server}" in
  uvicorn-server)
    echo "Running database migrations (alembic upgrade head)..."
    alembic upgrade head

    workers="${API_WORKERS:-2}"
    echo "Starting uvicorn with ${workers} worker(s)..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${workers}"
    ;;
  celery-worker)
    concurrency="${WORKER_CONCURRENCY:-4}"
    echo "Starting Celery worker with concurrency ${concurrency}..."
    exec celery -A app.tasks.celery_app worker --loglevel=info --concurrency "${concurrency}"
    ;;
  celery-beat)
    echo "Starting Celery beat scheduler..."
    exec celery -A app.tasks.celery_app beat --loglevel=info
    ;;
  *)
    # Anything else is passed straight through -- lets you still run
    # ad-hoc commands (a shell, alembic history, etc.) against the image
    # for debugging: `docker run ... backend alembic current`.
    exec "$@"
    ;;
esac