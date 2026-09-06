"""Centralized logging setup.

Two concrete problems this fixes, found from a real production log dump:

1. Every log line looked the same regardless of severity, and a single
   unhandled exception's traceback (which can run to 100+ lines) was
   visually indistinguishable from routine request logs around it --
   there was nothing marking where the actual error started or ended.
2. `request_id` was included in the *format string* of exactly one
   logger.exception() call (in main.py's exception handler) rather than
   attached to every log record automatically -- so it only ever
   appeared on that one line, and even then was usually "-" because of
   a separate contextvar-propagation bug (see RequestIDMiddleware in
   main.py, fixed alongside this).
"""
import json
import logging
import sys
import traceback

from app.core.config import settings
from app.core.request_context import request_id_var


class RequestIdFilter(logging.Filter):
    """Attaches the current request's correlation ID to every log
    record, so %(request_id)s (console) or the "request_id" field
    (JSON) is populated automatically -- no per-call string formatting
    needed anywhere else in the codebase."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class ConsoleFormatter(logging.Formatter):
    """Human-readable, lightly colorized output for local development.
    Not used in production -- see JsonFormatter below for that."""

    _LEVEL_COLORS = {
        logging.DEBUG: "\033[36m",  # cyan
        logging.INFO: "\033[32m",  # green
        logging.WARNING: "\033[33m",  # yellow
        logging.ERROR: "\033[31m",  # red
        logging.CRITICAL: "\033[1;31m",  # bold red
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._LEVEL_COLORS.get(record.levelno, "")
        prefix = (
            f"{self.formatTime(record, '%Y-%m-%d %H:%M:%S')} "
            f"{color}{record.levelname:<8}{self._RESET} "
            f"[{record.name}] [req={getattr(record, 'request_id', '-')}] "
        )
        message = record.getMessage()
        line = f"{prefix}{message}"
        if record.exc_info:
            # A real 500's traceback is still genuinely useful locally --
            # this doesn't hide it, just makes clear where it starts,
            # since a wall of unmarked traceback lines is what made the
            # original log excerpt hard to scan in the first place.
            exc_text = "".join(traceback.format_exception(*record.exc_info))
            line += f"\n{color}--- traceback ---{self._RESET}\n{exc_text}{color}--- end traceback ---{self._RESET}"
        return line


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = "".join(traceback.format_exception(*record.exc_info))
        return json.dumps(payload)


def configure_logging() -> None:
    """Call once, at app startup (see main.py)."""
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)

    # attached -- otherwise log lines get formatted and printed twice.
    for existing_handler in list(root.handlers):
        root.removeHandler(existing_handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    if settings.effective_log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(ConsoleFormatter())
    root.addHandler(handler)

    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)