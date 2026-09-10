"""Persisted cadence plus a PostgreSQL lock held for the whole job.

Success is recorded only after completion. Failed jobs are retried next tick.
"""
from datetime import datetime, timedelta
from sqlalchemy import Column, DateTime, String, text
from database import Base, SessionLocal
from db_coordination import transaction_lock


class JobRun(Base):
    __tablename__ = "platform_job_runs"
    name = Column(String(100), primary_key=True)
    last_success = Column(DateTime, nullable=True)


def run_due(name, interval_seconds, callback):
    with SessionLocal() as db:
        if db.bind.dialect.name == "sqlite":
            # SQLite is only the single-process development backend. A second
            # write connection while a job runs would deadlock BEGIN IMMEDIATE.
            import threading
            lock = _LOCAL_LOCK
            if not lock.acquire(blocking=False):
                return False
        else:
            lock = None
            import hashlib
            key = int.from_bytes(hashlib.sha256(("job:" + name).encode()).digest()[:8], "big", signed=True)
            if not db.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}).scalar():
                return False
        try:
            row = db.get(JobRun, name)
            now = datetime.utcnow()
            if row and row.last_success and now - row.last_success < timedelta(seconds=interval_seconds):
                return False
            callback()
            if row is None:
                row = JobRun(name=name)
                db.add(row)
            row.last_success = datetime.utcnow()
            db.commit()
            return True
        finally:
            if lock:
                lock.release()


import threading
_LOCAL_LOCK = threading.RLock()
