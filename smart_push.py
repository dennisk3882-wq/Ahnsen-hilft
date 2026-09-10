from __future__ import annotations

from platform_runtime import get_platform_snapshot

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from community_crud import (
    get_due_digest_users,
    get_pending_notifications,
    get_preference,
    mark_notifications_delivered,
    queue_notification,
)


REALTIME_CATEGORIES = {
    "push_meldungen",
    "push_dgh",
    "push_unwetter",
    "push_bevoelkerungsschutz",
    "push_hochwasser",
    "push_warnungen",
}


def in_quiet_hours(pref, now) -> bool:
    def minutes(value):
        try:
            hour, minute = map(int, str(value).split(":"))
            return hour * 60 + minute if 0 <= hour < 24 and 0 <= minute < 60 else None
        except (ValueError, TypeError):
            return None
    start, end = minutes(getattr(pref, "quiet_start", "")), minutes(getattr(pref, "quiet_end", ""))
    if start is None or end is None or start == end:
        return False
    current = now.hour * 60 + now.minute
    return start <= current < end if start < end else current >= start or current < end


def notification_strategy(user_id: int, category: str | None) -> str:
    if category in REALTIME_CATEGORIES:
        return "sofort"
    pref = get_preference(user_id)
    mode = getattr(pref, "push_mode", "sofort") or "sofort"
    return "ruhezeit" if mode == "sofort" and in_quiet_hours(pref, datetime.now(ZoneInfo("Europe/Berlin"))) else mode


def enqueue_digest_notification(
    user_id: int,
    category: str,
    title: str,
    body: str,
    url: str,
    tag: str,
) -> bool:
    day = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
    dedupe_key = f"{day}:{category}:{tag}:{title}"[:220]
    return queue_notification(user_id, category, title, body, url, dedupe_key)


def digest_due_at(pref, now):
    due = now.replace(hour=pref.digest_hour, minute=0, second=0, microsecond=0)
    if pref.push_mode == "woechentlich":
        due -= timedelta(days=now.weekday())
        if due > now: due -= timedelta(days=7)
    elif due > now:
        due -= timedelta(days=1)
    return due.astimezone(timezone.utc).replace(tzinfo=None) if due.tzinfo else due


def dispatch_due_digests(send_immediate) -> int:
    now = datetime.now(ZoneInfo("Europe/Berlin"))
    delivered = 0
    for user, pref in get_due_digest_users(now):
        pending = get_pending_notifications(user.id, limit=40)
        if pref.push_mode != "sofort":
            due = digest_due_at(pref, now)
            pending = [item for item in pending if item.erstellt_am <= due]
        if not pending:
            continue
        preview = pending[:5]
        lines = [f"• {item.title}" for item in preview]
        if len(pending) > len(preview):
            lines.append(f"• und {len(pending) - len(preview)} weitere Hinweise")
        period = "Wochen" if getattr(pref, "push_mode", "") == "woechentlich" else "Tages"
        cfg = get_platform_snapshot()
        body = f"{period}zusammenfassung für {cfg['municipality_name']}: " + " ".join(lines)
        sent = send_immediate(
            user.id,
            f"Deine {cfg['municipality_name']}-Zusammenfassung",
            body,
            "/nachrichten",
            f"digest-{now.date().isoformat()}",
            None,
            _force_immediate=True,
        )
        if sent:
            mark_notifications_delivered([item.id for item in pending])
            delivered += 1
    return delivered
