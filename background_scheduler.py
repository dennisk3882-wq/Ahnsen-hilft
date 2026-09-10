from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone


_lock = threading.Lock()
_started = False


def _enabled() -> bool:
    value = os.getenv("BACKGROUND_JOBS_ENABLED")
    if value is None:
        value = os.getenv("WARNING_BACKGROUND_ENABLED", "true")
    value = value.strip().casefold()
    return value not in {"0", "false", "no", "off"}


def _run_forever() -> None:
    from pwa_push_job import run
    from system_diagnostics import record_system_event
    from operations import run_scheduled_backup
    from community_crud import ensure_previous_month_report
    from job_control import JobRun, run_due
    from database import engine
    JobRun.__table__.create(bind=engine, checkfirst=True)
    jobs = (("push", 55, run), ("backup", 3600, run_scheduled_backup), ("monthly_report", 3600, ensure_previous_month_report))
    while True:
        for name, interval, callback in jobs:
            try:
                run_due(name, interval, callback)
            except Exception as error:
                record_system_event("background_scheduler", "error", f"Hintergrundaufgabe {name} fehlgeschlagen: {type(error).__name__}")
        # A minute-based tick cannot get permanently stuck outside a due window.
        time.sleep(60.0)


def start_background_scheduler() -> bool:
    """Start the singleton daemon used by the always-on Render web service."""
    global _started
    if not _enabled():
        return False
    with _lock:
        if _started:
            return True
        threading.Thread(
            target=_run_forever,
            name="ahnsen-background-jobs",
            daemon=True,
        ).start()
        _started = True
    return True
