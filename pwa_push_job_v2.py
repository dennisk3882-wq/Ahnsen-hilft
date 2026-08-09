from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from community_crud import init_community_db
from crud import init_db
from dgh_crud import init_dgh_db
from gemeinde_crud import init_gemeinde_db
from muelltermine_crud import get_naechste_muelltermine, init_muelltermine_db
from muelltermine_texte import formatiere_abfuhrarten, verbinde_aufzaehlung
from platform_runtime import get_platform_snapshot
from pwa_crud import (
    delivery_already_sent,
    get_users_with_waste_push,
    init_pwa_db,
    mark_delivery_sent,
)
from push_service import push_configured, send_user_notification
from smart_push import dispatch_due_digests
from system_diagnostics import init_system_diagnostics_db, record_system_event
from veranstaltungen_crud import init_veranstaltungen_db
from warning_service import init_warning_db, poll_warning_sources
from waste_preferences import get_waste_reminder_times


BERLIN = ZoneInfo("Europe/Berlin")


def _record(status: str, message: str, details=None) -> None:
    try:
        record_system_event("muell_cron", status, message, details or {})
    except Exception as error:
        print("Cron-Status konnte nicht protokolliert werden:", repr(error))


def _reminder_target(now: datetime, reminder_time: str):
    """Return target collection date and wording for a due reminder slot.

    The half-hour cron hits the chosen slot exactly. The 18/20 o'clock slots
    stay eligible for the second half-hour run as a recovery window; delivery
    deduplication prevents duplicates. 07:00 is a recovery for installations
    that still execute the legacy hourly Render schedule and therefore cannot
    hit 06:30 until the Blueprint schedule has been synchronized.
    """
    if reminder_time == "18:00" and now.hour == 18:
        return now.date() + timedelta(days=1), "morgen"
    if reminder_time == "20:00" and now.hour == 20:
        return now.date() + timedelta(days=1), "morgen"
    if reminder_time == "06:30":
        if now.hour == 6 and now.minute >= 25:
            return now.date(), "heute"
        if now.hour == 7 and now.minute < 10:
            return now.date(), "heute"
    return None


def _collection_label(items) -> str:
    labels: list[str] = []
    for item in items:
        for label in formatiere_abfuhrarten(
            getattr(item, "abfuhrarten", ""), mit_symbol=False
        ):
            if label not in labels:
                labels.append(label)
    return verbinde_aufzaehlung(labels) or "Müllabfuhr"


def run() -> int:
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()
    # waste_preferences is imported above, therefore its table is registered
    # on Base before create_all runs here.
    init_pwa_db()
    init_system_diagnostics_db()
    init_warning_db()
    init_community_db()

    try:
        now = datetime.now(BERLIN)

        # The cron now runs every 30 minutes for the 06:30 waste option. Keep
        # official warning polling and smart-digest dispatch on the top-of-hour
        # run only so their cadence does not accidentally double.
        if now.minute < 10:
            warning_result = poll_warning_sources(send_push=True)
            print(
                f"Amtliche Warnquellen geprüft: {warning_result.get('new', 0)} neu, "
                f"{warning_result.get('pushed_devices', 0)} Push-Zustellung(en)."
            )
            digest_delivered = dispatch_due_digests(send_user_notification)
            if digest_delivered:
                print(
                    f"Smart-Push-Zusammenfassung an {digest_delivered} Konten versendet."
                )

        if not push_configured():
            message = "VAPID-Schlüssel fehlen; Push-Job beendet."
            _record("error", message)
            print(message)
            return 0

        users = get_users_with_waste_push()
        reminder_times = get_waste_reminder_times([user.id for user in users])
        due = []
        for user in users:
            reminder_time = reminder_times.get(user.id, "18:00")
            target = _reminder_target(now, reminder_time)
            if target:
                target_date, wording = target
                due.append((user, reminder_time, target_date, wording))

        if not due:
            message = "Kontrolllauf erfolgreich; aktuell ist kein Müll-Erinnerungsfenster fällig."
            _record(
                "ok",
                message,
                {"berlin_time": now.strftime("%Y-%m-%d %H:%M"), "active_users": len(users)},
            )
            print(message)
            return 0

        target_dates = {entry[2] for entry in due}
        first_date = min(target_dates)
        terms = get_naechste_muelltermine(limit=60, ab_datum=first_date)
        terms_by_date = {
            target_date: [
                item for item in terms if getattr(item, "datum", None) == target_date
            ]
            for target_date in target_dates
        }

        delivered = 0
        skipped = 0
        no_collection = 0
        municipality = get_platform_snapshot()["municipality_name"]

        for user, reminder_time, target_date, wording in due:
            current_terms = terms_by_date.get(target_date) or []
            if not current_terms:
                no_collection += 1
                continue

            kinds = _collection_label(current_terms)
            delivery_key = f"muell:{target_date.isoformat()}:{kinds}"[:180]
            if delivery_already_sent(user.id, delivery_key):
                skipped += 1
                continue

            is_today = wording == "heute"
            title = "Müllabfuhr heute" if is_today else "Müllabfuhr morgen"
            lead = "Heute" if is_today else "Morgen"
            sent = send_user_notification(
                user.id,
                title,
                f"{lead} wird in {municipality} abgeholt: {kinds}.",
                "/muelltermine-info",
                f"muell-{target_date.isoformat()}",
                "push_muell",
                _force_immediate=True,
            )
            if sent:
                mark_delivery_sent(user.id, delivery_key)
                delivered += 1

        message = (
            f"Müll-Erinnerungslauf erfolgreich; {delivered} zugestellt, "
            f"{skipped} bereits versendet, {no_collection} ohne Abholung."
        )
        _record(
            "ok",
            message,
            {
                "berlin_time": now.strftime("%Y-%m-%d %H:%M"),
                "due_users": len(due),
                "delivered": delivered,
                "skipped": skipped,
                "no_collection": no_collection,
            },
        )
        print(message)
        return delivered
    except Exception as error:
        _record(
            "error",
            f"Cronjob abgebrochen: {type(error).__name__}: {str(error)[:500]}",
        )
        raise


if __name__ == "__main__":
    run()
