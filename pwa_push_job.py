from datetime import timedelta
from zoneinfo import ZoneInfo

from crud import init_db
from dgh_crud import init_dgh_db
from gemeinde_crud import init_gemeinde_db
from muelltermine_crud import get_naechste_muelltermine, init_muelltermine_db
from pwa_crud import (
    delivery_already_sent,
    get_users_with_waste_push,
    init_pwa_db,
    mark_delivery_sent,
)
from push_service import push_configured, send_user_notification
from system_diagnostics import init_system_diagnostics_db, record_system_event
from veranstaltungen_crud import init_veranstaltungen_db
from warning_service import init_warning_db, poll_warning_sources
from community_crud import init_community_db
from smart_push import dispatch_due_digests


def _record(status: str, message: str, details=None) -> None:
    try:
        record_system_event("muell_cron", status, message, details or {})
    except Exception as error:
        print("Cron-Status konnte nicht protokolliert werden:", repr(error))


def run() -> int:
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()
    init_pwa_db()
    init_system_diagnostics_db()
    init_warning_db()
    init_community_db()

    try:
        warning_result = poll_warning_sources(send_push=True)
        print(
            f"Amtliche Warnquellen geprüft: {warning_result.get('new', 0)} neu, "
            f"{warning_result.get('pushed_devices', 0)} Push-Zustellung(en)."
        )
        if not push_configured():
            message = "VAPID-Schlüssel fehlen; Push-Job beendet."
            _record("error", message)
            print(message)
            return 0

        now = __import__("datetime").datetime.now(ZoneInfo("Europe/Berlin"))
        digest_delivered = dispatch_due_digests(send_user_notification)
        if digest_delivered:
            print(f"Smart-Push-Zusammenfassung an {digest_delivered} Konten versendet.")
        if now.hour != 18:
            message = "Stündlicher Kontrolllauf erfolgreich; außerhalb des Erinnerungsfensters."
            _record("ok", message, {"berlin_hour": now.hour})
            print("Außerhalb des Erinnerungsfensters; Push-Job beendet.")
            return 0

        tomorrow = now.date() + timedelta(days=1)
        terms = [
            item
            for item in get_naechste_muelltermine(limit=30)
            if getattr(item, "datum", None) == tomorrow
        ]
        if not terms:
            message = "18-Uhr-Lauf erfolgreich; morgen ist keine Müllabfuhr eingetragen."
            _record("ok", message, {"date": tomorrow.isoformat(), "delivered": 0})
            print("Morgen ist keine Müllabfuhr eingetragen.")
            return 0

        kinds = ", ".join(
            sorted({str(getattr(item, "abfuhrarten", "Müllabfuhr")) for item in terms})
        )
        delivery_key = f"muell:{tomorrow.isoformat()}:{kinds}"
        delivered = 0

        for user in get_users_with_waste_push():
            if delivery_already_sent(user.id, delivery_key):
                continue
            sent = send_user_notification(
                user.id,
                "Müllabfuhr morgen",
                f"Morgen wird in Ahnsen abgeholt: {kinds}.",
                "/muelltermine-info",
                f"muell-{tomorrow.isoformat()}",
                "push_muell",
            )
            if sent:
                mark_delivery_sent(user.id, delivery_key)
                delivered += 1

        message = f"18-Uhr-Lauf erfolgreich; Müllabfuhr-Push an {delivered} Konten versendet."
        _record(
            "ok",
            message,
            {"date": tomorrow.isoformat(), "kinds": kinds, "delivered": delivered},
        )
        print(f"Müllabfuhr-Push an {delivered} Konten versendet.")
        return delivered
    except Exception as error:
        _record("error", f"Cronjob abgebrochen: {type(error).__name__}: {str(error)[:500]}")
        raise


if __name__ == "__main__":
    run()
