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

    while True:
        started = time.monotonic()
        try:
            run()
            record_system_event(
                "background_scheduler",
                "ok",
                "Push-, Warn- und Erinnerungsaufgaben wurden ausgeführt.",
                {"finished_at": datetime.now(timezone.utc).isoformat()},
            )
        except Exception as error:
            record_system_event(
                "background_scheduler",
                "error",
                f"Hintergrundlauf fehlgeschlagen: {type(error).__name__}: {error}",
            )
        elapsed = time.monotonic() - started
        time.sleep(max(60.0, 1800.0 - elapsed))


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
