"""Account export and erasure, including the neighbourhood extensions."""
from datetime import datetime
from sqlalchemy import or_
from database import SessionLocal
from models import Meldung
from dgh_models import DGHTermin
from pwa_models import PWAUser, PushSubscription, PushDelivery, PasswordResetToken
from community_models import CitizenPreference, CitizenMessage, Idea, IdeaComment, IdeaSupport, NeighborPost, NotificationQueue
from neighborhood_models import NeighborConversation, NeighborChatMessage, NeighborFavorite, NeighborCategorySubscription, NeighborReport, NeighborRestriction


def _row(item, exclude=()):
    result = {}
    for column in item.__table__.columns:
        if column.name in exclude:
            continue
        value = getattr(item, column.name)
        result[column.name] = value.isoformat() if isinstance(value, datetime) else value
    return result


def export_account(user_id: int) -> dict:
    with SessionLocal() as db:
        user = db.get(PWAUser, user_id)
        if not user or not user.aktiv:
            raise ValueError("Konto nicht verfügbar.")
        payload = {"exportiert_am": datetime.utcnow().isoformat(), "profil": _row(user, {"password_hash", "session_version"})}
        for name, model, owner in (
            ("maengel", Meldung, "pwa_user_id"), ("dgh", DGHTermin, "pwa_user_id"),
            ("einstellungen", CitizenPreference, "user_id"), ("ideen", Idea, "user_id"),
            ("ideen_kommentare", IdeaComment, "user_id"), ("ideen_unterstuetzung", IdeaSupport, "user_id"),
            ("nachbarschaft", NeighborPost, "user_id"), ("favoriten", NeighborFavorite, "user_id"),
            ("kategorie_abos", NeighborCategorySubscription, "user_id"),
            ("moderationsmeldungen", NeighborReport, "reporter_user_id"),
            ("wartende_benachrichtigungen", NotificationQueue, "user_id"),
        ):
            payload[name] = [_row(row, {"interne_notiz", "assigned_to", "public_reviewed_by"}) for row in db.query(model).filter(getattr(model, owner) == user_id).all()]
        payload["nachrichten"] = [_row(row) for row in db.query(CitizenMessage).filter(or_(CitizenMessage.user_id == user_id, CitizenMessage.sender_user_id == user_id)).all()]
        conversations = db.query(NeighborConversation).filter(or_(NeighborConversation.participant_a == user_id, NeighborConversation.participant_b == user_id)).all()
        payload["chats"] = [{"gespraech": _row(conv), "nachrichten": [_row(row) for row in db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id).all()]} for conv in conversations]
        # Device endpoints and cryptographic material are deliberately excluded.
        payload["push_geraete"] = [_row(row, {"endpoint", "p256dh", "auth"}) for row in db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()]
        return payload


def erase_account(user_id: int) -> None:
    with SessionLocal() as db:
        user = db.query(PWAUser).filter(PWAUser.id == user_id).with_for_update().one()
        identifiers = [user.email, user.telefon, user.name]
        def redact(value):
            text = str(value or "")
            for identifier in identifiers:
                if identifier and len(identifier) >= 3:
                    text = text.replace(identifier, "[entfernt]")
            return text
        for case in db.query(Meldung).filter(Meldung.pwa_user_id == user_id).all():
            case.whatsapp_absender = "Gelöschtes Bürgerkonto"
            case.pwa_user_id = None
            case.public_visible = False
            case.foto_base64 = None
            case.foto_vorhanden = "Nein"
            for field in ("beschreibung", "ort", "interne_notiz", "public_note"):
                setattr(case, field, redact(getattr(case, field)))
        for booking in db.query(DGHTermin).filter(DGHTermin.pwa_user_id == user_id).all():
            booking.name = "Gelöschtes Bürgerkonto"
            booking.email = booking.telefon = booking.whatsapp_absender = ""
            booking.kommentar = "[Nachricht nach Kontolöschung entfernt]"
            booking.anlass = redact(booking.anlass)
            booking.pwa_user_id = None
        for model in (Idea, NeighborPost):
            for row in db.query(model).filter(model.user_id == user_id).all():
                row.aktiv = False
                row.title = "[Beitrag entfernt]"
                row.description = ""
        for row in db.query(NeighborChatMessage).filter(NeighborChatMessage.sender_user_id == user_id).all():
            row.body = "[Nachricht nach Kontolöschung entfernt]"
        for row in db.query(CitizenMessage).filter(CitizenMessage.sender_user_id == user_id).all():
            row.body = "[Nachricht nach Kontolöschung entfernt]"
            row.subject = "Entfernte Nachricht"
            row.sender_label = "Gelöschtes Konto"
        for model, owner in (
            (PushSubscription, "user_id"), (PushDelivery, "user_id"), (PasswordResetToken, "user_id"),
            (CitizenPreference, "user_id"), (CitizenMessage, "user_id"), (NotificationQueue, "user_id"),
            (IdeaSupport, "user_id"), (IdeaComment, "user_id"), (NeighborFavorite, "user_id"),
            (NeighborCategorySubscription, "user_id"), (NeighborReport, "reporter_user_id"),
            (NeighborRestriction, "user_id"),
        ):
            db.query(model).filter(getattr(model, owner) == user_id).delete(synchronize_session=False)
        user.email = f"deleted-{user_id}@invalid.local"
        user.name = "Gelöschtes Konto"
        user.telefon = ""
        user.password_hash = "deleted"
        user.aktiv = False
        user.session_version = (user.session_version or 1) + 1
        db.commit()
