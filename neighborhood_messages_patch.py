from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Request

import neighborhood_routes as base
from community_crud import create_message
from community_models import CitizenMessage
from database import SessionLocal


router = APIRouter()
_original_send_user_notification = base.send_user_notification


def _send_and_mirror_to_inbox(
    user_id: int | None,
    title: str,
    body: str,
    url: str = "/profil",
    tag: str = "ahnsen-hilft",
    category: str | None = None,
    _force_immediate: bool = False,
):
    """Private Nachbarschaftschats also appear in the central citizen inbox.

    The header message icon and its unread dot use CitizenMessage. Mirroring only
    chat URLs here makes that icon the single entry point for private replies
    without cluttering it with every neighborhood category push.
    """
    if user_id and str(url or "").startswith("/nachbarschaft/chat/"):
        try:
            create_message(
                user_id,
                str(title or "Private Nachricht")[:180],
                str(body or "")[:5000],
                category="nachbarschaft-chat",
                url=str(url)[:500],
                sender_label="Nachbarschaftshilfe",
            )
        except Exception as error:
            print("Nachbarschaftschat konnte nicht ins Bürgerpostfach gespiegelt werden:", repr(error))
    return _original_send_user_notification(
        user_id,
        title,
        body,
        url,
        tag,
        category,
        _force_immediate,
    )


base.send_user_notification = _send_and_mirror_to_inbox


@router.get("/nachbarschaft/chat/{conversation_id}")
async def chat_detail_and_mark_inbox_read(request: Request, conversation_id: int):
    user = base._required(request, f"/nachbarschaft/chat/{conversation_id}")
    chat_url = f"/nachbarschaft/chat/{conversation_id}"
    db = SessionLocal()
    try:
        unread = (
            db.query(CitizenMessage)
            .filter(CitizenMessage.user_id == user.id)
            .filter(CitizenMessage.category == "nachbarschaft-chat")
            .filter(CitizenMessage.url == chat_url)
            .filter(CitizenMessage.gelesen_am.is_(None))
            .all()
        )
        now = datetime.utcnow()
        for item in unread:
            item.gelesen_am = now
        if unread:
            db.commit()
    finally:
        db.close()
    return await base.chat_detail(request, conversation_id)
