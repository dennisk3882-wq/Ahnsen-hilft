from __future__ import annotations

import json
from datetime import datetime
from html import escape
from urllib.parse import quote

from fastapi.responses import HTMLResponse

from community_crud import SUPPORTED_LANGUAGES
from intern_ui import intern_nav, intern_nav_css
from neighbor_v2_service import CATEGORIES, LOCATIONS, REPORT_REASONS
from pwa_ui import page


STYLE = r'''
<style>
.nh-shell{display:grid;gap:18px;min-width:0}.nh-heading{padding:8px 0 2px}.nh-heading .back{display:inline-flex;margin-bottom:24px;color:var(--forest);font-weight:850;text-decoration:none}.nh-heading .eyebrow,.nh-eyebrow{display:block;color:#91a979;font-size:12px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.nh-heading h1{margin:8px 0 10px;color:#10281e;font-size:clamp(34px,7vw,54px);line-height:1.02}.nh-heading p{margin:0;max-width:760px;color:var(--muted);font-size:17px;line-height:1.55}.nh-hero{padding:22px;border:1px solid #dce6d9;border-radius:28px;background:linear-gradient(145deg,#f9fcf6,#edf6e9);box-shadow:0 15px 34px rgba(33,73,50,.08)}.nh-hero h2{margin:6px 0 8px;color:var(--forest);font-size:26px}.nh-hero p{margin:0;color:var(--muted);line-height:1.55}.nh-cta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.nh-button,.nh-button-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 15px;border-radius:15px;font:inherit;font-size:14px;font-weight:900;text-decoration:none;cursor:pointer}.nh-button{border:0;background:var(--forest);color:#fff}.nh-button-secondary{border:1px solid #cbd8ca;background:#fff;color:var(--forest)}.nh-button.small,.nh-button-secondary.small{min-height:40px;padding:8px 11px;font-size:12px}.nh-info{display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px 13px;border-radius:15px;background:rgba(255,255,255,.75);color:#54655c;font-size:12px;line-height:1.5}.nh-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px}.nh-section-head h2{margin:4px 0 0;color:var(--forest);font-size:27px}.nh-section-head p{margin:0;color:var(--muted);font-size:12px}.nh-filter-scroll{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 7px;scroll-snap-type:x proximity;scrollbar-width:none}.nh-filter-scroll::-webkit-scrollbar{display:none}.nh-chip{flex:0 0 auto;scroll-snap-align:start;display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border:1px solid #d6dfd2;border-radius:999px;background:#fff;color:#526158;font-size:12px;font-weight:850;text-decoration:none}.nh-chip.active{border-color:#94b592;background:#eaf4e7;color:var(--forest)}.nh-search{display:grid;grid-template-columns:1fr auto;gap:8px}.nh-search input,.nh-field input,.nh-field select,.nh-field textarea{width:100%;box-sizing:border-box;border:1px solid #cad7ca;border-radius:15px;background:#fff;color:#183529;font:inherit;font-size:15px}.nh-search input{min-height:48px;padding:0 14px}.nh-field{display:grid;gap:6px}.nh-field>span{color:#315141;font-size:12px;font-weight:900}.nh-field input,.nh-field select{min-height:50px;padding:0 14px}.nh-field textarea{min-height:110px;padding:12px 14px;resize:vertical}.nh-form{display:grid;gap:12px}.nh-feed{display:grid;gap:12px}.nh-card{position:relative;min-width:0;padding:18px;border:1px solid #dde5da;border-radius:22px;background:#fff;box-shadow:0 10px 27px rgba(30,66,46,.055)}.nh-card.urgent{border-color:#dfba83;background:linear-gradient(145deg,#fffdf8,#fff8eb)}.nh-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.nh-card h3{margin:5px 0 8px;color:#15382a;font-size:21px;line-height:1.2}.nh-card p{margin:0;color:#647168;line-height:1.52;overflow-wrap:anywhere}.nh-badges{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.nh-badge{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#eef4eb;color:#315542;font-size:10px;font-weight:900}.nh-badge.seek{background:#fff0d5;color:#8a5a0b}.nh-badge.offer{background:#e5f4e8;color:#25643e}.nh-badge.urgent{background:#fde8d4;color:#984d12}.nh-badge.status{background:#eef1ed;color:#56615b}.nh-date{color:#859087;font-size:11px}.nh-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.nh-actions form{margin:0}.nh-empty{padding:27px 18px;border:1px dashed #cad8c8;border-radius:20px;background:#fbfcf9;text-align:center;color:var(--muted)}.nh-empty strong{display:block;margin-bottom:5px;color:var(--forest)}.nh-create{padding:19px;border:1px solid #dce5d9;border-radius:24px;background:#fff}.nh-create summary{cursor:pointer;list-style:none;color:var(--forest);font-size:20px;font-weight:950}.nh-create summary::-webkit-details-marker{display:none}.nh-create summary:after{content:'+';float:right}.nh-create[open] summary:after{content:'–'}.nh-create .nh-form{margin-top:16px}.nh-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.nh-check{display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:15px;background:#f5f8f2;color:#42564a;font-size:13px}.nh-check input{margin-top:2px}.nh-own{display:grid;gap:8px}.nh-own-row{padding:13px;border:1px solid #dfe5dc;border-radius:17px;background:#fff}.nh-own-row strong{color:var(--forest)}.nh-own-meta{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px}.nh-restricted{padding:15px;border:1px solid #e2b9a8;border-radius:18px;background:#fff1ea;color:#76432f}.nh-subscribe{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:16px;background:#f1f6ee}.nh-subscribe p{margin:0;color:#526159;font-size:12px}.nh-post-focus{padding:20px;border:1px solid #dce6da;border-radius:24px;background:#fff}.nh-chat-shell{display:grid;gap:12px}.nh-chat-head{padding:17px;border:1px solid #dce5d9;border-radius:22px;background:#f5f9f2}.nh-chat-head h2{margin:4px 0;color:var(--forest)}.nh-chat-head p{margin:0;color:var(--muted);font-size:12px}.nh-messages{display:grid;gap:9px}.nh-message{max-width:84%;padding:11px 13px;border-radius:17px;background:#f0f3ef;color:#3f5148}.nh-message.mine{justify-self:end;background:#dfeedd;color:#234a36}.nh-message time{display:block;margin-top:5px;color:#77837c;font-size:9px}.nh-message-report{margin-top:6px}.nh-message-report summary{cursor:pointer;color:#7c6f68;font-size:10px}.nh-message-report form{display:grid;gap:7px;margin-top:7px;padding:9px;border-radius:12px;background:#fff}.nh-message-report select,.nh-message-report textarea{width:100%;box-sizing:border-box;border:1px solid #d7dcd5;border-radius:10px;padding:8px;font:inherit;font-size:11px}.nh-composer{position:sticky;bottom:104px;display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;border:1px solid #d5dfd3;border-radius:18px;background:rgba(255,255,252,.96);backdrop-filter:blur(12px)}.nh-composer textarea{min-height:48px;max-height:130px;padding:11px;border:0;background:transparent;font:inherit;resize:none}.nh-chat-actions{display:flex;gap:8px;flex-wrap:wrap}.nh-inbox{display:grid;gap:10px}.nh-thread{display:grid;grid-template-columns:1fr auto;gap:10px;padding:15px;border:1px solid #dce5d9;border-radius:18px;background:#fff;color:inherit;text-decoration:none}.nh-thread.unread{border-color:#94b592;background:#f6fbf4}.nh-thread strong{display:block;color:var(--forest)}.nh-thread small{color:var(--muted)}.nh-thread p{margin:5px 0 0;color:#657269;font-size:12px}.nh-unread{display:grid;place-items:center;min-width:28px;height:28px;border-radius:999px;background:var(--forest);color:#fff;font-size:11px;font-weight:900}.nh-mail{padding:14px;border:1px solid #dfe6dc;border-radius:18px;background:#fff}.nh-mail.unread{border-color:#9ebd96;background:#f7fbf5}.nh-mail h3{margin:4px 0;color:var(--forest)}.nh-mail p{margin:0;color:var(--muted);white-space:pre-line}.nh-privacy{padding:13px;border-radius:16px;background:#eef5eb;color:#53645a;font-size:12px;line-height:1.5}.nh-report-card{padding:17px;border:1px solid #e0c4b5;border-radius:20px;background:#fffaf6}.nh-report-snapshot{margin-top:10px;padding:11px;border-radius:13px;background:#f5f5f1;white-space:pre-wrap;color:#4d5a53;font-size:12px}.nh-context{display:grid;gap:5px;margin-top:8px}.nh-context div{padding:7px 9px;border-radius:10px;background:#f6f7f4;font-size:11px}.nh-admin-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.nh-admin-actions form{display:flex;gap:6px;flex-wrap:wrap}.nh-admin-actions select,.nh-admin-actions input{padding:8px;border:1px solid #ccd5cb;border-radius:10px;background:#fff}.nh-admin-actions button{padding:8px 10px;border:0;border-radius:10px;background:#174936;color:#fff;font-weight:850}.nh-bottom-space{height:130px}
@media(max-width:620px){.nh-hero{padding:18px}.nh-cta,.nh-two{grid-template-columns:1fr}.nh-section-head{align-items:flex-start;flex-direction:column}.nh-card{padding:16px}.nh-composer{bottom:116px}.nh-search{grid-template-columns:1fr auto}.nh-heading p{font-size:16px}}
</style>
'''


def _fmt_date(value: datetime | None) -> str:
    return value.strftime("%d.%m.%Y · %H:%M") if value else ""


def _post_card(item: dict, *, user_id: int | None = None) -> str:
    owner = bool(user_id and item["user_id"] == user_id)
    urgent = " urgent" if item.get("urgent") else ""
    kind_class = "offer" if item.get("kind") == "Biete" else "seek"
    badges = [f'<span class="nh-badge {kind_class}">{escape(item.get("kind") or "Suche")}</span>', f'<span class="nh-badge">{escape(item.get("category") or "Alltag")}</span>', f'<span class="nh-badge">📍 {escape(item.get("location") or "Ahnsen")}</span>']
    if item.get("urgent"):
        badges.append('<span class="nh-badge urgent">Dringend</span>')
    actions = []
    if user_id and not owner:
        label = "Ich kann helfen" if item.get("kind") == "Suche" else "Privat anfragen"
        actions.append(f'<a class="nh-button small" href="/nachbarschaft/{item["id"]}/antworten">💬 {label}</a>')
        saved_label = "✓ Gemerkt" if item.get("saved") else "☆ Merken"
        actions.append(f'<form method="post" action="/nachbarschaft/{item["id"]}/merken"><button class="nh-button-secondary small" type="submit">{saved_label}</button></form>')
        actions.append(f'<a class="nh-button-secondary small" href="/nachbarschaft/{item["id"]}/melden">Melden</a>')
    elif not user_id:
        actions.append('<a class="nh-button small" href="/anmelden?next=/nachbarschaft">Anmelden zum Antworten</a>')
    if owner:
        actions.extend([
            f'<a class="nh-button-secondary small" href="/nachbarschaft/{item["id"]}/bearbeiten">Bearbeiten</a>',
            f'<form method="post" action="/nachbarschaft/{item["id"]}/erledigt"><button class="nh-button-secondary small" type="submit">Erledigt</button></form>',
        ])
    desc = escape(item.get("description") or "")
    return f'''<article class="nh-card{urgent}"><div class="nh-card-top"><div><span class="nh-eyebrow">{escape(item.get("category") or "Nachbarschaft")}</span><h3>{escape(item.get("title") or "")}</h3></div><span class="nh-date">{escape(_fmt_date(item.get("created")))}</span></div><div class="nh-badges">{"".join(badges)}</div><p>{desc}</p><div class="nh-badges"><span class="nh-badge">von {escape(item.get("author") or "Nachbar/in")}</span></div><div class="nh-actions">{"".join(actions)}</div></article>'''


def neighbor_home_page(feed: list[dict], own_posts: list[dict], *, user_id: int | None, logged_in: bool, restriction: dict, kind: str = "", category: str = "", search: str = "", new_kind: str = "", subscriptions: set[str] | None = None, message: str = "") -> HTMLResponse:
    subscriptions = subscriptions or set()
    query_parts = []
    if kind:
        query_parts.append(f"kind={quote(kind)}")
    if category:
        query_parts.append(f"category={quote(category)}")
    if search:
        query_parts.append(f"q={quote(search)}")
    def url_for(**changes):
        values = {"kind": kind, "category": category, "q": search}
        values.update(changes)
        parts = [f"{k}={quote(str(v))}" for k, v in values.items() if v]
        return "/nachbarschaft" + ("?" + "&".join(parts) if parts else "")
    filter_chips = [f'<a class="nh-chip{" active" if not kind else ""}" href="{url_for(kind="")}">Alle</a>', f'<a class="nh-chip{" active" if kind == "Suche" else ""}" href="{url_for(kind="Suche")}">Hilfe gesucht</a>', f'<a class="nh-chip{" active" if kind == "Biete" else ""}" href="{url_for(kind="Biete")}">Hilfe angeboten</a>']
    category_chips = [f'<a class="nh-chip{" active" if category == c else ""}" href="{url_for(category=c if category != c else "")}">{escape(c)}</a>' for c in CATEGORIES]
    feed_html = "".join(_post_card(item, user_id=user_id) for item in feed) or '<div class="nh-empty"><strong>Hier ist gerade nichts offen.</strong>Ändere den Filter oder schau später noch einmal vorbei.</div>'
    notice = f'<div class="nh-privacy">✓ {escape(message)}</div>' if message else ""
    subscribe = ""
    if logged_in and category in CATEGORIES:
        active = category in subscriptions
        subscribe = f'<div class="nh-subscribe"><p>{"Push ist aktiv" if active else "Benachrichtigung gewünscht?"}<br><strong>{escape(category)}</strong></p><form method="post" action="/nachbarschaft/kategorie-abo"><input type="hidden" name="category" value="{escape(category)}"><button class="nh-button-secondary small" type="submit">{"Abo ausschalten" if active else "Kategorie abonnieren"}</button></form></div>'
    create_area = ""
    if logged_in and not restriction.get("blocked"):
        selected_kind = "Biete" if new_kind == "Biete" else "Suche"
        create_area = f'''<details class="nh-create" id="beitrag-erstellen"{" open" if new_kind else ""}><summary>Eigenen Beitrag erstellen</summary><form class="nh-form" method="post" action="/nachbarschaft"><div class="nh-two"><label class="nh-field"><span>Ich …</span><select name="kind"><option{" selected" if selected_kind == "Suche" else ""}>Suche</option><option{" selected" if selected_kind == "Biete" else ""}>Biete</option></select></label><label class="nh-field"><span>Kategorie</span><select name="category">{"".join(f'<option>{escape(c)}</option>' for c in CATEGORIES)}</select></label></div><label class="nh-field"><span>Titel *</span><input name="title" maxlength="180" required placeholder="z. B. Fahrdienst zum Arzt gesucht"></label><label class="nh-field"><span>Beschreibung *</span><textarea name="description" minlength="10" maxlength="3000" required placeholder="Beschreibe kurz, wobei du Hilfe suchst oder was du anbieten kannst. Keine Telefonnummer oder genaue Adresse nötig."></textarea></label><div class="nh-two"><label class="nh-field"><span>Bereich</span><select name="location_label">{"".join(f'<option>{escape(x)}</option>' for x in LOCATIONS)}</select></label><label class="nh-field"><span>Automatisch ausblenden</span><select name="expiry_days"><option value="14">nach 14 Tagen</option><option value="30" selected>nach 30 Tagen</option></select></label></div><label class="nh-check"><input type="checkbox" name="urgent" value="1"><span><strong>Dringend</strong><br>Nur verwenden, wenn zeitnahe Hilfe wirklich wichtig ist.</span></label><div class="nh-privacy">Öffentlich erscheinen nur dein Vorname, der grobe Bereich und dein Beitrag. E-Mail, Telefonnummer und genaue Adresse bleiben verborgen. Absprachen laufen danach privat im Chat.</div><button class="nh-button" type="submit">Zur Prüfung einreichen</button></form></details>'''
    elif logged_in:
        until = restriction.get("until")
        detail = "dauerhaft" if restriction.get("permanent") else (f'bis {until.strftime("%d.%m.%Y %H:%M")}' if until else "vorübergehend")
        create_area = f'<div class="nh-restricted"><strong>Nachbarschaftshilfe eingeschränkt</strong><br>Dein Konto ist für neue Beiträge und Nachrichten {escape(detail)} gesperrt. {escape(restriction.get("reason") or "")}</div>'
    else:
        create_area = '<div class="nh-create"><summary style="list-style:none">Mitmachen</summary><p style="color:var(--muted)">Für eigene Beiträge und private Antworten brauchst du ein Bürgerkonto.</p><a class="nh-button" href="/anmelden?next=/nachbarschaft">Anmelden</a></div>'
    own = ""
    if logged_in:
        rows = []
        for item in own_posts:
            rows.append(f'''<div class="nh-own-row"><strong>{escape(item["title"])}</strong><div class="nh-own-meta"><span class="nh-badge status">{escape(item["status"])}</span><span class="nh-badge">{escape(item["kind"])}</span><span class="nh-badge">{escape(item["category"])}</span></div><div class="nh-actions"><a class="nh-button-secondary small" href="/nachbarschaft/{item["id"]}/bearbeiten">Bearbeiten</a><form method="post" action="/nachbarschaft/{item["id"]}/verlaengern"><button class="nh-button-secondary small" type="submit">30 Tage verlängern</button></form><form method="post" action="/nachbarschaft/{item["id"]}/erledigt"><button class="nh-button-secondary small" type="submit">Erledigt</button></form><form method="post" action="/nachbarschaft/{item["id"]}/loeschen"><button class="nh-button-secondary small" type="submit">Löschen</button></form></div></div>''')
        own = f'<section class="nh-shell"><div class="nh-section-head"><div><span class="nh-eyebrow">Mein Bereich</span><h2>Meine Beiträge</h2></div></div><div class="nh-own">{"".join(rows) or "<div class=\"nh-empty\">Noch keine eigenen Beiträge.</div>"}</div></section>'
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/">← Zurück</a><span class="eyebrow">Gemeinschaft</span><h1>Nachbarschaftshilfe</h1><p>Hilfe im Dorf finden oder selbst anbieten – öffentlich nur das Nötigste, alles Weitere privat.</p></div><section class="nh-hero"><span class="nh-eyebrow">Gemeinsam geht vieles leichter</span><h2>Was brauchst du – oder wobei kannst du helfen?</h2><p>Aktuelle Gesuche und Angebote stehen direkt hier. Keine öffentlichen Kommentarspalten: Wenn es passt, wechselt ihr in einen geschützten 1:1-Chat.</p><div class="nh-cta"><a class="nh-button" href="/nachbarschaft?neu=Suche#beitrag-erstellen">Hilfe suchen</a><a class="nh-button-secondary" href="/nachbarschaft?neu=Biete#beitrag-erstellen">Hilfe anbieten</a></div><div class="nh-info"><span>🔒</span><span>Telefon, E-Mail und genaue Adresse werden nicht öffentlich angezeigt. Persönliche Absprachen gehören in den privaten Chat.</span></div></section>{notice}<section class="nh-shell"><div class="nh-section-head"><div><span class="nh-eyebrow">Aktuell in Ahnsen</span><h2>Offene Beiträge</h2></div><p>{len(feed)} angezeigt</p></div><div class="nh-filter-scroll">{"".join(filter_chips)}</div><div class="nh-filter-scroll">{"".join(category_chips)}</div><form class="nh-search" method="get" action="/nachbarschaft"><input name="q" value="{escape(search)}" placeholder="Beiträge durchsuchen …"><button class="nh-button small" type="submit">Suchen</button></form>{subscribe}<div class="nh-feed">{feed_html}</div></section>{create_area}{own}<div class="nh-bottom-space"></div></section>'''
    return page("Nachbarschaftshilfe", content, active="home", body_class="community-view")


def reply_page(post: dict, *, restricted: bool = False, message: str = "") -> HTMLResponse:
    notice = f'<div class="nh-privacy">{escape(message)}</div>' if message else ""
    form = '<div class="nh-restricted">Dein Zugang zur Nachbarschaftshilfe ist derzeit eingeschränkt.</div>' if restricted else f'''<form class="nh-form" method="post" action="/nachbarschaft/{post["id"]}/antworten"><label class="nh-field"><span>Private Nachricht *</span><textarea name="body" minlength="1" maxlength="3000" required placeholder="Hallo, ich könnte helfen …"></textarea></label><div class="nh-privacy">Diese Nachricht sieht nur der Ersteller des Beitrags. Deine E-Mail oder Telefonnummer wird nicht automatisch weitergegeben.</div><button class="nh-button" type="submit">Privaten Chat starten</button></form>'''
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/nachbarschaft">← Nachbarschaftshilfe</a><span class="eyebrow">Privat antworten</span><h1>{escape(post["title"])}</h1><p>{escape(post["description"])}</p></div><article class="nh-post-focus"><div class="nh-badges"><span class="nh-badge">{escape(post["kind"])}</span><span class="nh-badge">{escape(post["category"])}</span><span class="nh-badge">📍 {escape(post["location"])}</span><span class="nh-badge">von {escape(post["author"])}</span></div>{notice}{form}</article><a class="nh-button-secondary" href="/nachbarschaft/{post["id"]}/melden">Beitrag melden</a><div class="nh-bottom-space"></div></section>'''
    return page("Privat antworten", content, active="home", body_class="community-view")


def post_edit_page(post: dict, message: str = "") -> HTMLResponse:
    notice = f'<div class="nh-privacy">{escape(message)}</div>' if message else ""
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/nachbarschaft">← Nachbarschaftshilfe</a><span class="eyebrow">Mein Beitrag</span><h1>Beitrag bearbeiten</h1><p>Nach inhaltlichen Änderungen wird der Beitrag erneut kurz geprüft.</p></div>{notice}<section class="nh-create" open><form class="nh-form" method="post"><div class="nh-two"><label class="nh-field"><span>Ich …</span><select name="kind"><option{" selected" if post["kind"] == "Suche" else ""}>Suche</option><option{" selected" if post["kind"] == "Biete" else ""}>Biete</option></select></label><label class="nh-field"><span>Kategorie</span><select name="category">{"".join(f'<option{" selected" if c == post["category"] else ""}>{escape(c)}</option>' for c in CATEGORIES)}</select></label></div><label class="nh-field"><span>Titel</span><input name="title" value="{escape(post["title"])}" maxlength="180" required></label><label class="nh-field"><span>Beschreibung</span><textarea name="description" maxlength="3000" required>{escape(post["description"])}</textarea></label><div class="nh-two"><label class="nh-field"><span>Bereich</span><select name="location_label">{"".join(f'<option{" selected" if x == post["location"] else ""}>{escape(x)}</option>' for x in LOCATIONS)}</select></label><label class="nh-field"><span>Laufzeit</span><select name="expiry_days"><option value="14">14 Tage</option><option value="30" selected>30 Tage</option></select></label></div><label class="nh-check"><input type="checkbox" name="urgent" value="1"{" checked" if post.get("urgent") else ""}><span>Als dringend markieren</span></label><button class="nh-button" type="submit">Änderungen zur Prüfung senden</button></form></section><div class="nh-bottom-space"></div></section>'''
    return page("Beitrag bearbeiten", content, active="home", body_class="community-view")


def report_post_page(post: dict, message: str = "") -> HTMLResponse:
    reasons = "".join(f'<option>{escape(r)}</option>' for r in REPORT_REASONS)
    notice = f'<div class="nh-privacy">{escape(message)}</div>' if message else ""
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/nachbarschaft">← Nachbarschaftshilfe</a><span class="eyebrow">Sicherheit</span><h1>Beitrag melden</h1><p>Die Meldung geht ausschließlich an die Verwaltung. Der andere Nutzer erhält darüber keine Benachrichtigung.</p></div>{notice}<article class="nh-post-focus"><strong>{escape(post["title"])}</strong><p>{escape(post["description"])}</p></article><form class="nh-create nh-form" method="post"><label class="nh-field"><span>Grund</span><select name="reason">{reasons}</select></label><label class="nh-field"><span>Zusätzlicher Hinweis</span><textarea name="detail" maxlength="1500" placeholder="Optional"></textarea></label><button class="nh-button" type="submit">Meldung vertraulich senden</button></form><div class="nh-bottom-space"></div></section>'''
    return page("Beitrag melden", content, active="home", body_class="community-view")


def chat_page(data: dict, user_id: int, *, blocked_by_me: bool = False, blocked_either: bool = False, message: str = "") -> HTMLResponse:
    rows = []
    reasons = "".join(f'<option>{escape(r)}</option>' for r in REPORT_REASONS)
    for item in data["messages"]:
        mine = item["sender_user_id"] == user_id
        report = ""
        if not mine:
            report = f'''<details class="nh-message-report"><summary>Nachricht melden</summary><form method="post" action="/nachbarschaft/chat/{data["id"]}/melden"><input type="hidden" name="message_id" value="{item["id"]}"><select name="reason">{reasons}</select><textarea name="detail" maxlength="1500" placeholder="Optionaler Hinweis"></textarea><button class="nh-button-secondary small" type="submit">Vertraulich melden</button></form></details>'''
        rows.append(f'''<div class="nh-message{" mine" if mine else ""}">{escape(item["body"])}<time>{escape(_fmt_date(item.get("created")))}</time>{report}</div>''')
    messages = "".join(rows) or '<div class="nh-empty">Noch keine Nachrichten.</div>'
    composer = ""
    if data["status"] == "Aktiv" and not blocked_either:
        composer = f'''<form class="nh-composer" method="post" action="/nachbarschaft/chat/{data["id"]}/nachricht"><textarea name="body" maxlength="3000" required placeholder="Private Nachricht schreiben …"></textarea><button class="nh-button small" type="submit">Senden</button></form>'''
    elif blocked_either:
        composer = '<div class="nh-restricted">In diesem Chat können wegen einer Blockierung keine neuen Nachrichten gesendet werden.</div>'
    else:
        composer = f'<div class="nh-restricted">Dieser Chat ist {escape(data["status"].lower())}. Es können keine neuen Nachrichten gesendet werden.</div>'
    block_action = f'<form method="post" action="/nachbarschaft/chat/{data["id"]}/{"entsperren" if blocked_by_me else "blockieren"}"><button class="nh-button-secondary small" type="submit">{"Blockierung aufheben" if blocked_by_me else "Nutzer blockieren"}</button></form>'
    notice = f'<div class="nh-privacy">{escape(message)}</div>' if message else ""
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/nachrichten">← Nachrichten</a><span class="eyebrow">Privater Chat</span><h1>{escape(data["other_name"])}</h1><p>Zu „{escape(data["post_title"])}“</p></div><section class="nh-chat-head"><span class="nh-eyebrow">Nur für euch sichtbar</span><h2>{escape(data["post_title"])}</h2><p>Persönliche Daten nur teilen, wenn du das selbst möchtest. Öffentliche Kommentare gibt es bewusst nicht.</p></section>{notice}<section class="nh-messages">{messages}</section>{composer}<div class="nh-chat-actions">{block_action}<form method="post" action="/nachbarschaft/chat/{data["id"]}/schliessen"><button class="nh-button-secondary small" type="submit">Chat beenden</button></form></div><div class="nh-bottom-space"></div></section>'''
    return page("Privater Chat", content, active="profile", body_class="community-view")


def messages_center_page(chats: list[dict], mailbox, unread_total: int) -> HTMLResponse:
    chat_rows = []
    for item in chats:
        unread = int(item.get("unread") or 0)
        chat_rows.append(f'''<a class="nh-thread{" unread" if unread else ""}" href="/nachbarschaft/chat/{item["id"]}"><div><strong>{escape(item["other_name"])} · {escape(item["post_title"])}</strong><small>{escape(_fmt_date(item.get("last_at")))}</small><p>{escape((item.get("last_body") or "")[:160])}</p></div>{f'<span class="nh-unread">{unread}</span>' if unread else ''}</a>''')
    mails = []
    for item in mailbox:
        unread = not getattr(item, "gelesen_am", None)
        stamp = _fmt_date(getattr(item, "erstellt_am", None))
        mails.append(f'''<article class="nh-mail{" unread" if unread else ""}"><span class="nh-eyebrow">{escape(getattr(item,"sender_label","") or "Ahnsen hilft")}</span><h3>{escape(getattr(item,"subject","") or "Nachricht")}</h3><p>{escape(getattr(item,"body","") or "")}</p><div class="nh-actions">{f'<form method="post" action="/nachrichten/{item.id}/gelesen"><button class="nh-button-secondary small" type="submit">Als gelesen markieren</button></form>' if unread else ''}{f'<a class="nh-button-secondary small" href="{escape(getattr(item,"url","") or "/")}">Öffnen</a>' if getattr(item,"url","") else ''}</div><span class="nh-date">{escape(stamp)}</span></article>''')
    content = f'''{STYLE}<section class="nh-shell"><div class="nh-heading"><a class="back" href="/profil">← Mein Ahnsen</a><span class="eyebrow">Mein Postfach</span><h1>Nachrichten</h1><p>{unread_total} ungelesen. Private Nachbarschafts-Chats und Mitteilungen der Verwaltung an einem Ort.</p></div><section class="nh-shell"><div class="nh-section-head"><div><span class="nh-eyebrow">Privat</span><h2>Nachbarschafts-Chats</h2></div></div><div class="nh-inbox">{"".join(chat_rows) or '<div class="nh-empty">Noch keine privaten Chats.</div>'}</div></section><section class="nh-shell"><div class="nh-section-head"><div><span class="nh-eyebrow">Mitteilungen</span><h2>Ahnsen hilft & Verwaltung</h2></div></div><div class="nh-inbox">{"".join(mails) or '<div class="nh-empty">Keine Mitteilungen.</div>'}</div></section><div class="nh-bottom-space"></div></section>'''
    return page("Nachrichten", content, active="profile", body_class="community-view")


def admin_neighbor_page_v2(data: dict, message: str = "") -> HTMLResponse:
    css = f'''<style>{intern_nav_css()}</style>{STYLE}'''
    report_cards = []
    for r in data["reports"]:
        try:
            context = json.loads(r.get("context") or "[]")
        except Exception:
            context = []
        context_html = "".join(f'<div><strong>Nutzer #{escape(str(x.get("sender_user_id") or ""))}</strong>: {escape(str(x.get("body") or ""))}</div>' for x in context)
        options = '''<option value="close">Als erledigt schließen</option><option value="warn">Nutzer verwarnen</option><option value="lock_chat">Chat sperren</option><option value="hide_post">Beitrag ausblenden</option><option value="suspend_7">7 Tage sperren</option><option value="suspend_30">30 Tage sperren</option><option value="permanent">Dauerhaft sperren</option>'''
        report_cards.append(f'''<article class="nh-report-card"><span class="nh-eyebrow">Offene Meldung #{r["id"]} · {escape(r["type"])}</span><h3>{escape(r["reason"])}</h3><p><strong>Gemeldet von:</strong> {escape(r["reporter"])} · <strong>betroffener Nutzer:</strong> {escape(r["reported"])}</p>{f'<p>{escape(r["detail"])}</p>' if r.get("detail") else ''}<div class="nh-report-snapshot">{escape(r.get("snapshot") or "")}</div>{f'<div class="nh-context">{context_html}</div>' if context_html else ''}<div class="nh-admin-actions"><form method="post" action="/intern/nachbarschaft/meldungen/{r["id"]}/aktion"><select name="action">{options}</select><input name="resolution" maxlength="1000" placeholder="Interne Begründung / Hinweis"><button type="submit">Aktion ausführen</button></form></div></article>''')
    post_cards = []
    for p in data["posts"]:
        options = "".join(f'<option value="{s}"{" selected" if s == p["status"] else ""}>{s}</option>' for s in ("Prüfung", "Freigegeben", "Erledigt", "Abgelehnt"))
        post_cards.append(f'''<article class="nh-card"><span class="nh-eyebrow">#{p["id"]} · {escape(p["kind"])} · {escape(p["category"])}</span><h3>{escape(p["title"])}</h3><p>{escape(p["description"])}</p><div class="nh-badges"><span class="nh-badge">von {escape(p["author"])}</span><span class="nh-badge">{escape(p["status"])}</span>{'<span class="nh-badge urgent">Dringend</span>' if p.get('urgent') else ''}</div><form class="nh-admin-actions" method="post" action="/intern/nachbarschaft/{p["id"]}/status"><select name="status">{options}</select><button type="submit">Status speichern</button></form></article>''')
    restrictions = []
    for r in data["restrictions"]:
        until = "dauerhaft" if r.get("permanent") else (_fmt_date(r.get("until")) if r.get("until") else "nur verwarnt")
        restrictions.append(f'''<div class="nh-card"><strong>{escape(r["name"])} · Nutzer #{r["user_id"]}</strong><p>{escape(until)} · Verwarnungen: {int(r.get("warning_count") or 0)}<br>{escape(r.get("reason") or "")}</p><form method="post" action="/intern/nachbarschaft/sperren/{r["user_id"]}/aufheben"><button class="nh-button-secondary small" type="submit">Sperre aufheben</button></form></div>''')
    notice = f'<div class="nh-privacy">{escape(message)}</div>' if message else ""
    body = f'''<section><span class="eyebrow">Moderation</span><h1>Nachbarschaftshilfe</h1><p>Beiträge freigeben, vertrauliche Meldungen bearbeiten und Schutzmaßnahmen verwalten.</p></section>{notice}<section class="admin-section"><h2>Offene Meldungen · {len(data["reports"])}</h2><p class="nh-privacy">Datenschutz: Die Verwaltung kann nicht beliebig alle privaten Chats durchsuchen. Bei einer Meldung wird nur die gemeldete Nachricht samt kleinem Kontext-Snapshot angezeigt.</p><div class="nh-shell">{"".join(report_cards) or '<div class="nh-empty">Keine offenen Meldungen.</div>'}</div></section><section class="admin-section"><h2>Beiträge & Freigaben</h2><div class="nh-shell">{"".join(post_cards) or '<div class="nh-empty">Keine Beiträge.</div>'}</div></section><section class="admin-section"><h2>Verwarnungen & Sperren</h2><div class="nh-shell">{"".join(restrictions) or '<div class="nh-empty">Keine aktiven Einschränkungen.</div>'}</div></section>'''
    html = f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nachbarschaftshilfe · Verwaltung</title>{css}</head><body><div class="container">{intern_nav("nachbarschaft")}{body}</div></body></html>'''
    return HTMLResponse(html)
