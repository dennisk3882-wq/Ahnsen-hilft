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
        from concurrent.futures import ThreadPoolExecutor
        from sqlalchemy.orm import sessionmaker
        from database import Base
        import dgh_crud, community_crud
        Base.metadata.create_all(target)
        sessions = sessionmaker(bind=target)
        with patch("dgh_crud.SessionLocal", sessions):
            def book(_):
                try:
                    dgh_crud.save_dgh_termin("20.09.2026", "18:00", "Concurrency test", "Test", "", "")
                    return "confirmed"
                except ValueError:
                    return "conflict"
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(book, range(2)))
            assert sorted(results) == ["confirmed", "conflict"], results
        with patch("community_crud.SessionLocal", sessions), patch.dict("os.environ", {"AUDIT_SIGNING_SECRET": "postgres-drill-secret"}):
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda index: community_crud.audit_event("test", "concurrent", object_id=str(index)), range(20)))
            result = community_crud.verify_audit_chain()
            assert result["valid"] and result["checked"] == 20, result
        print("PostgreSQL restore, dependency order, identity continuation and rollback passed.")
        print("PostgreSQL concurrent DGH bookings and audit writers passed.")
    finally:
        target.dispose()
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')


if __name__ == "__main__":
    main()
