from __future__ import annotations

from datetime import datetime
from html import escape
from urllib.parse import quote

from pwa_ui import page

CATEGORIES = ("Alltag", "Fahrdienst", "Einkauf", "Werkzeug", "Tiere", "Garten", "Kinder & Familie", "Sonstiges")

CSS = """
<style>
.nh{display:grid;gap:15px}.nh-hero,.nh-card{padding:19px;border:1px solid var(--line);border-radius:23px;background:#fff;box-shadow:var(--soft-shadow)}.nh-hero{background:linear-gradient(145deg,#fff,#eef6eb)}.nh-hero h1{margin:6px 0;font-size:clamp(34px,7vw,52px)}.nh-copy{color:var(--muted);line-height:1.55}.nh-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.nh-actions form{margin:0}.nh-btn{display:inline-flex;justify-content:center;align-items:center;min-height:48px;padding:9px 13px;border:1px solid #c7d6c5;border-radius:14px;background:#fff;color:var(--forest);font-weight:900;text-decoration:none}.nh-btn.primary{background:var(--forest);color:#fff}.nh-toolbar{display:flex;gap:7px;overflow:auto;padding:4px 0}.nh-chip,.nh-tag{white-space:nowrap;padding:7px 10px;border-radius:999px;background:#eef5eb;color:var(--forest);font-size:.7rem;font-weight:850;text-decoration:none}.nh-chip{border:1px solid var(--line);background:#fff}.nh-chip.active{background:var(--forest);color:#fff}.nh-tag.urgent{background:#fff0d5;color:#8b5700}.nh-meta{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 11px}.nh-card h2,.nh-card h3{margin:4px 0 6px}.nh-form{display:grid;gap:11px}.nh-form textarea{min-height:115px}.nh-empty{padding:28px;text-align:center;border:1px dashed var(--line);border-radius:20px;color:var(--muted)}.nh-chat{display:grid;gap:9px}.nh-bubble{max-width:84%;padding:11px 13px;border-radius:16px;background:#f2f5f0}.nh-bubble.mine{margin-left:auto;background:#deeddf}.nh-bubble small,.nh-report{display:block;margin-top:5px;font-size:.68rem;color:#77847b}.nh-report{color:#8a5a35}.nh-compose{display:grid;grid-template-columns:1fr auto;gap:8px;position:sticky;bottom:120px;padding:10px;border:1px solid var(--line);border-radius:17px;background:#fff}.nh-compose input{min-width:0;padding:12px;border:1px solid var(--line);border-radius:12px}.nh-compose button{border:0;border-radius:12px;background:var(--forest);color:#fff;font-weight:900;padding:0 14px}.nh-report-content{padding:11px;border-radius:12px;background:#f4f5f1;margin:9px 0}.nh-safety{padding:14px;border-radius:16px;background:#f5f8f2;color:#506056;line-height:1.5}
</style>
"""


def heading(title: str, text: str, back: str = "/") -> str:
    return f'<section class="page-heading compact"><a class="back-link" href="{escape(back)}">← Zurück</a><span class="eyebrow">Gemeinschaft</span><h1>{escape(title)}</h1><p>{escape(text)}</p></section>'


def first_name(user) -> str:
    value = str(getattr(user, "name", "") or "").strip()
    return value.split()[0] if value else "Nachbar/in"


def relative_time(value: datetime | None) -> str:
    if not value:
        return ""
    seconds = max(0, int((datetime.utcnow() - value).total_seconds()))
    if seconds < 60:
        return "gerade eben"
    if seconds < 3600:
        return f"vor {seconds // 60} Min."
    if seconds < 86400:
        return f"vor {seconds // 3600} Std."
    return f"vor {seconds // 86400} Tagen"


def post_card(post, author, user_id: int | None, favorites: set[int], urgent: bool) -> str:
    if user_id == post.user_id:
        actions = (
            f'<form method="post" action="/nachbarschaft/{post.id}/erledigt"><button class="nh-btn">✓ Erledigt</button></form>'
            f'<a class="nh-btn" href="/nachbarschaft/{post.id}/bearbeiten">Bearbeiten</a>'
            f'<form method="post" action="/nachbarschaft/{post.id}/loeschen"><button class="nh-btn">Löschen</button></form>'
        )
    elif user_id:
        actions = (
            f'<form method="post" action="/nachbarschaft/{post.id}/antworten"><button class="nh-btn primary">Privat antworten</button></form>'
            f'<form method="post" action="/nachbarschaft/{post.id}/merken"><button class="nh-btn">{"★ Gemerkt" if post.id in favorites else "☆ Merken"}</button></form>'
            f'<a class="nh-btn" href="/nachbarschaft/{post.id}/melden">Melden</a>'
        )
    else:
        actions = '<a class="nh-btn primary" href="/anmelden?next=/nachbarschaft">Anmelden & antworten</a>'
    urgent_chip = '<span class="nh-tag urgent">Dringend</span>' if urgent else ""
    return (
        f'<article class="nh-card"><span class="eyebrow">{escape(post.kind)}</span><h2>{escape(post.title)}</h2>'
        f'<div class="nh-meta"><span class="nh-tag">{escape(post.category)}</span><span class="nh-tag">von {escape(first_name(author))}</span>'
        f'<span class="nh-tag">{escape(relative_time(post.erstellt_am))}</span>{urgent_chip}</div>'
        f'<p class="nh-copy">{escape(post.description)}</p><div class="nh-actions">{actions}</div></article>'
    )


def neighborhood_page(*, rows, logged_user, favorites: set[int], subscriptions: set[str], urgent_ids: set[int], category: str = "", own: bool = False, message: str = ""):
    uid = getattr(logged_user, "id", None)
    cards = "".join(post_card(post, author, uid, favorites, post.id in urgent_ids) for post, author in rows)
    if not cards:
        cards = '<div class="nh-empty"><strong>Noch keine passenden Beiträge.</strong><p>Mach den Anfang oder ändere den Filter.</p></div>'
    chips = ['<a class="nh-chip active" href="/nachbarschaft">Alle</a>'] + [f'<a class="nh-chip" href="/nachbarschaft?kategorie={quote(c)}">{escape(c)}</a>' for c in CATEGORIES]
    if category:
        chips[0] = chips[0].replace(" active", "")
        chips = [x.replace('class="nh-chip"', 'class="nh-chip active"') if f'kategorie={quote(category)}' in x else x for x in chips]
    notice = f'<div class="form-alert success-alert">{escape(message)}</div>' if message else ""
    if logged_user:
        checks = "".join(f'<label><input type="checkbox" name="categories" value="{escape(c)}" {"checked" if c in subscriptions else ""}> {escape(c)}</label>' for c in CATEGORIES)
        top = '<div class="nh-actions"><a class="nh-btn" href="/nachbarschaft/chats">💬 Meine privaten Chats</a><a class="nh-btn" href="/nachbarschaft?eigene=1">📌 Meine Anzeigen</a></div>'
        form = f'''<section class="nh-card" id="beitrag"><span class="eyebrow">Neuer Beitrag</span><h2>Hilfe suchen oder anbieten</h2><form class="nh-form" method="post" action="/nachbarschaft"><label class="field"><span>Ich …</span><select name="kind"><option>Suche</option><option>Biete</option></select></label><label class="field"><span>Kategorie</span><select name="category">{''.join(f'<option>{escape(c)}</option>' for c in CATEGORIES)}</select></label><label class="field"><span>Titel *</span><input name="title" maxlength="180" required placeholder="z. B. Einkaufshilfe am Dienstag"></label><label class="field"><span>Beschreibung *</span><textarea name="description" maxlength="3000" required placeholder="Keine Adresse oder Telefonnummer öffentlich eintragen – dafür gibt es den privaten Chat."></textarea></label><label><input type="checkbox" name="urgent" value="ja"> Als dringend markieren</label><button class="nh-btn primary" type="submit">Zur Prüfung einreichen</button></form></section><section class="nh-card"><span class="eyebrow">Benachrichtigungen</span><h2>Push für neue Hilfe</h2><p class="nh-copy">Lass dich bei neuen freigegebenen Beiträgen in deinen Kategorien informieren.</p><form class="nh-form" method="post" action="/nachbarschaft/abos">{checks}<button class="nh-btn" type="submit">Abos speichern</button></form></section>'''
    else:
        top = ""
        form = '<section class="nh-card"><h2>Mitmachen</h2><p class="nh-copy">Zum Antworten, Erstellen und für private Chats brauchst du ein Bürgerkonto.</p><a class="nh-btn primary" href="/anmelden?next=/nachbarschaft">Anmelden</a></section>'
    body = f'''{CSS}{heading("Nachbarschaftshilfe","Hilfe im Dorf finden, anbieten und danach privat organisieren.")}{notice}<section class="nh"><section class="nh-hero"><span class="eyebrow">Gemeinsam in Ahnsen</span><h1>Gemeinsam geht vieles leichter.</h1><p class="nh-copy">Öffentlich steht nur die Anzeige. Persönliche Daten, Telefonnummern und konkrete Absprachen gehören in den privaten Chat.</p><div class="nh-actions"><a class="nh-btn primary" href="#beitrag">Hilfe suchen</a><a class="nh-btn" href="#beitrag">Hilfe anbieten</a></div>{top}</section><section><span class="eyebrow">Aktuell in Ahnsen</span><div class="nh-toolbar">{''.join(chips)}</div><div class="nh" style="margin-top:9px">{cards}</div></section>{form}</section>'''
    return page("Nachbarschaftshilfe", body, active="more", body_class="community-view")


def chat_list_page(cards: list[str]):
    body = f'{CSS}{heading("Private Chats","Absprachen zu Nachbarschaftsbeiträgen bleiben zwischen den Beteiligten.","/nachbarschaft")}<section class="nh">{"".join(cards) or "<div class=nh-empty>Noch keine privaten Chats.</div>"}</section>'
    return page("Private Chats", body, active="more", body_class="community-view")


def chat_page(*, title: str, other_name: str, conversation_id: int, bubbles: list[str]):
    body = f'''{CSS}{heading(title,f"Chat mit {other_name}.","/nachbarschaft/chats")}<section class="nh"><div class="nh-safety">Nur die Beteiligten sehen diesen Verlauf. Wird eine Nachricht gemeldet, erhält die Moderation nur diese konkrete Nachricht – nicht automatisch den gesamten Chat.</div><div class="nh-chat">{''.join(bubbles)}</div><form class="nh-compose" method="post"><input name="body" maxlength="2000" required placeholder="Private Nachricht …"><button type="submit">Senden</button></form><form method="post" action="/nachbarschaft/chat/{conversation_id}/blockieren"><button class="nh-btn" type="submit">Chat schließen</button></form></section>'''
    return page("Privater Chat", body, active="more", body_class="community-view")


def report_page(back: str):
    body = f'''{CSS}{heading("Inhalt melden","Die Meldung geht an die Verwaltung – nicht an die andere Person.",back)}<section class="nh-card"><form class="nh-form" method="post"><label class="field"><span>Grund</span><select name="reason"><option>Beleidigung / unangemessener Inhalt</option><option>Betrug / verdächtiges Verhalten</option><option>Belästigung</option><option>Datenschutz / persönliche Daten</option><option>Spam</option><option>Sonstiges</option></select></label><label class="field"><span>Optionaler Hinweis</span><textarea name="detail" maxlength="1000"></textarea></label><button class="nh-btn primary" type="submit">An Moderation senden</button></form></section>'''
    return page("Inhalt melden", body, active="more", body_class="community-view")


def edit_page(post):
    body = f'''{CSS}{heading("Anzeige bearbeiten","Änderungen werden erneut kurz geprüft.","/nachbarschaft?eigene=1")}<section class="nh-card"><form class="nh-form" method="post"><label class="field"><span>Titel</span><input name="title" value="{escape(post.title)}" maxlength="180" required></label><label class="field"><span>Beschreibung</span><textarea name="description" maxlength="3000" required>{escape(post.description)}</textarea></label><button class="nh-btn primary" type="submit">Änderungen speichern</button></form></section>'''
    return page("Anzeige bearbeiten", body, active="more", body_class="community-view")


def admin_page(report_cards: list[str], post_cards: list[str]):
    body = f'{CSS}{heading("Nachbarschaft moderieren","Meldungen prüfen und Beiträge freigeben.")}<section class="nh"><h2>Offene Meldungen</h2>{"".join(report_cards) or "<div class=nh-empty>Keine offenen Meldungen.</div>"}<h2>Beiträge</h2>{"".join(post_cards)}</section>'
    return page("Nachbarschaft Moderation", body, active="more", body_class="community-view")
