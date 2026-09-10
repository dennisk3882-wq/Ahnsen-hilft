"""Destructive integration drill, confined to a fresh, random test schema."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from uuid import uuid4
from unittest.mock import patch
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, ForeignKey, text
from database import engine
from operations import create_backup
from scripts.restore_backup import restore_payload


def main():
    if engine.dialect.name != "postgresql":
        raise SystemExit("This integration drill requires PostgreSQL.")
    schema = "restore_drill_" + uuid4().hex
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    target = create_engine(engine.url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        metadata = MetaData()
        parent = Table("parents", metadata, Column("id", Integer, primary_key=True))
        child = Table("children", metadata, Column("id", Integer, primary_key=True), Column("parent_id", Integer, ForeignKey("parents.id")))
        metadata.create_all(target)
        with target.begin() as connection:
            connection.execute(parent.insert().values(id=101))
            connection.execute(child.insert().values(id=205, parent_id=101))
        with patch("operations.engine", target):
            snapshot = create_backup()
        restore_payload(snapshot, target)
        with target.begin() as connection:
            new_parent = connection.execute(parent.insert().returning(parent.c.id)).scalar_one()
            new_child = connection.execute(child.insert().values(parent_id=new_parent).returning(child.c.id)).scalar_one()
            assert new_parent == 102, new_parent
            assert new_child == 206, new_child
        # A bad FK must roll back all deletions and previous inserts.
        import hashlib, json
        broken = json.loads(json.dumps(snapshot))
        broken["tables"]["children"][0]["parent_id"] = 9999
        broken.pop("sha256")
        broken["sha256"] = hashlib.sha256(json.dumps(broken, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        try:
            restore_payload(broken, target)
        except Exception:
            pass
        else:
            raise AssertionError("Invalid FK was accepted")
        with target.connect() as connection:
            assert len(connection.execute(parent.select()).all()) == 2
            assert len(connection.execute(child.select()).all()) == 2
        print("PostgreSQL restore, dependency order, identity continuation and rollback passed.")
    finally:
        target.dispose()
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')


if __name__ == "__main__":
    main()
