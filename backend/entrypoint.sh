#!/usr/bin/env bash
set -e

if [[ "$1" == "uvicorn" ]]; then
  echo "Running database migrations..."
  alembic upgrade head
fi

echo "Starting: $@"
exec "$@"