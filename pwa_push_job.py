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
from veranstaltungen_crud import init_veranstaltungen_db


def run() -> int:
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()
    init_pwa_db()

    if not push_configured():
        print("VAPID-Schlüssel fehlen; Push-Job beendet.")
        return 0

    now = __import__("datetime").datetime.now(ZoneInfo("Europe/Berlin"))
    if now.hour != 18:
        print("Außerhalb des Erinnerungsfensters; Push-Job beendet.")
        return 0

    tomorrow = now.date() + timedelta(days=1)
    terms = [
        item
        for item in get_naechste_muelltermine(limit=30)
        if getattr(item, "datum", None) == tomorrow
    ]
    if not terms:
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

    print(f"Müllabfuhr-Push an {delivered} Konten versendet.")
    return delivered


if __name__ == "__main__":
    run()
