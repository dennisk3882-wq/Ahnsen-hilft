from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import MetaData, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import engine  # noqa: E402
from operations import load_backup_bytes, validate_backup  # noqa: E402


def decode(value):
    if not isinstance(value, dict) or len(value) != 1:
        return value
    if "$binary" in value:
        return base64.b64decode(value["$binary"])
    if "$datetime" in value:
        return datetime.fromisoformat(value["$datetime"])
    if "$date" in value:
        return date.fromisoformat(value["$date"])
    if "$decimal" in value:
        return Decimal(value["$decimal"])
    return value


def restore_payload(payload, target_engine):
    """Refuse incomplete/schema-incompatible snapshots before deleting anything."""
    if not validate_backup(payload)["valid"]:
        raise ValueError("Ungültige Sicherung.")
    metadata = MetaData()
    with target_engine.begin() as connection:
        metadata.reflect(bind=connection)
        expected = set(metadata.tables) - {"rate_limit_events"}
        supplied = set(payload["tables"])
        if expected != supplied:
            raise ValueError("Schema passt nicht: fehlende oder unbekannte Tabellen. Zuerst in eine Datenbank mit passendem Schemastand wiederherstellen.")
        ordered = [table for table in metadata.sorted_tables if table.name in expected]
        decoded = {}
        for table in ordered:
            columns = set(table.columns.keys())
            decoded[table.name] = []
            for row in payload["tables"][table.name]:
                if set(row) != columns:
                    raise ValueError(f"Spalten stimmen nicht überein: {table.name}")
                decoded[table.name].append({key: decode(value) for key, value in row.items()})
        quote = connection.dialect.identifier_preparer.quote
        if target_engine.dialect.name == "postgresql":
            # Include every table explicitly; CASCADE must not erase data outside
            # the validated snapshot. RESTART is transactional, unlike setval.
            names = ", ".join(quote(table.name) for table in metadata.sorted_tables)
            connection.exec_driver_sql(f"TRUNCATE TABLE {names} RESTART IDENTITY")
        else:
            for table in reversed(metadata.sorted_tables):
                connection.execute(table.delete())
        for table in ordered:
            if decoded[table.name]:
                connection.execute(table.insert(), decoded[table.name])
        if target_engine.dialect.name == "postgresql":
            for table in ordered:
                for column in table.primary_key.columns:
                    sequence = connection.execute(text("SELECT pg_get_serial_sequence(:table, :column)"),
                                                  {"table": quote(table.name), "column": column.name}).scalar()
                    if sequence:
                        parts = connection.execute(text("SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=CAST(:sequence AS regclass)"), {"sequence": sequence}).one()
                        next_id = connection.exec_driver_sql(f"SELECT COALESCE(MAX({quote(column.name)}), 0) + 1 FROM {quote(table.name)}").scalar()
                        connection.exec_driver_sql(f"ALTER SEQUENCE {quote(parts[0])}.{quote(parts[1])} RESTART WITH {int(next_id)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate or restore an Ahnsen hilft JSON backup.")
    parser.add_argument("backup", type=Path)
    parser.add_argument("--confirm", default="", help="Must be exactly RESTORE-AHNSEN to replace current data.")
    parser.add_argument("--passphrase-env", default="BACKUP_RESTORE_PASSPHRASE", help="Environment variable containing the backup passphrase.")
    args = parser.parse_args()
    raw = args.backup.read_bytes()
    passphrase = os.getenv(args.passphrase_env, "")
    if raw.startswith(b"AHNSEN-BACKUP-V2") and not passphrase:
        passphrase = getpass.getpass("Backup passphrase: ")
    payload, encrypted = load_backup_bytes(raw, passphrase)
    result = validate_backup(payload)
    if not result["valid"]:
        raise SystemExit("Backup is invalid; no data was changed.")
    print(f"Valid {'encrypted' if encrypted else 'plain'} backup: {result['tables']} tables, {result['rows']} rows, created {result['created_at']}")
    if args.confirm != "RESTORE-AHNSEN":
        print("Validation only. Pass --confirm RESTORE-AHNSEN for an intentional restore.")
        return 0

    restore_payload(payload, engine)
    print("Restore completed transactionally.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
