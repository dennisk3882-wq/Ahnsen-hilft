from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import MetaData, Table, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import engine  # noqa: E402
from operations import validate_backup  # noqa: E402


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate or restore an Ahnsen hilft JSON backup.")
    parser.add_argument("backup", type=Path)
    parser.add_argument("--confirm", default="", help="Must be exactly RESTORE-AHNSEN to replace current data.")
    args = parser.parse_args()
    payload = json.loads(args.backup.read_text(encoding="utf-8"))
    result = validate_backup(payload)
    if not result["valid"]:
        raise SystemExit("Backup is invalid; no data was changed.")
    print(f"Valid backup: {result['tables']} tables, {result['rows']} rows, created {result['created_at']}")
    if args.confirm != "RESTORE-AHNSEN":
        print("Validation only. Pass --confirm RESTORE-AHNSEN for an intentional restore.")
        return 0

    tables_payload = payload["tables"]
    metadata = MetaData()
    tables = {name: Table(name, metadata, autoload_with=engine) for name in tables_payload}
    names = list(tables)
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            quoted = ", ".join(f'"{name}"' for name in names)
            connection.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        else:
            for name in reversed(names):
                connection.execute(tables[name].delete())
        for name in names:
            rows = [{key: decode(value) for key, value in row.items()} for row in tables_payload[name]]
            if rows:
                connection.execute(tables[name].insert(), rows)
    print("Restore completed transactionally.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
