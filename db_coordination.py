"""Transaction locks for compound decisions, shared across web workers."""
import hashlib
from sqlalchemy import text


def transaction_lock(db, resource: str) -> None:
    connection = db.connection()
    dialect = connection.dialect.name
    if dialect == "postgresql":
        key = int.from_bytes(hashlib.sha256(resource.encode()).digest()[:8], "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    elif dialect == "sqlite":
        # This must be the first database operation in the transaction.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
