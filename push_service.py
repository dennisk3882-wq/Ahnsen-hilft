from __future__ import annotations

import json
import os

from pywebpush import WebPushException, webpush

from pwa_crud import (
    delete_push_subscription,
    get_push_subscriptions_for_user,
    get_users_for_push_category,
    user_wants_push,
)


VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:gemeinde@ahnsen.de").strip()


def push_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY and VAPID_SUBJECT)


def public_key() -> str:
    return VAPID_PUBLIC_KEY


def send_user_notification(
    user_id: int | None,
    title: str,
    body: str,
    url: str = "/profil",
    tag: str = "ahnsen-hilft",
    category: str | None = None,
) -> int:
    if not user_id or not push_configured():
        return 0
    if category and not user_wants_push(user_id, category):
        return 0

    payload = json.dumps(
        {
            "title": str(title or "Ahnsen hilft")[:120],
            "body": str(body or "")[:500],
            "url": str(url or "/profil")[:500],
            "tag": str(tag or "ahnsen-hilft")[:120],
            "icon": "/pwa/icon-192.png",
            "badge": "/pwa/icon-192.png",
        },
        ensure_ascii=False,
    )

    sent = 0
    for subscription in get_push_subscriptions_for_user(user_id):
        info = {
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
        }
        try:
            webpush(
                subscription_info=info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                timeout=15,
            )
            sent += 1
        except WebPushException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status in {404, 410}:
                delete_push_subscription(subscription.endpoint)
            else:
                print("Push-Nachricht fehlgeschlagen:", repr(error))
        except Exception as error:
            print("Push-Nachricht konnte nicht versendet werden:", repr(error))

    return sent


def send_category_notification(
    category: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "ahnsen-hilft",
) -> int:
    sent = 0
    for user in get_users_for_push_category(category):
        sent += send_user_notification(
            user.id, title, body, url, tag, category=category
        )
    return sent
