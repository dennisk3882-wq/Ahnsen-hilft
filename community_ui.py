from __future__ import annotations

import json
from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from community_crud import SUPPORTED_LANGUAGES
from pwa_ui import icon, page
from platform_runtime import get_platform_snapshot


COMMUNITY_CSS = """
<style>
.community-shell{display:grid;gap:18px}.community-hero{padding:24px;border:1px solid var(--line);border-radius:26px;background:linear-gradient(145deg,#fff,#f3f7ef);box-shadow:var(--shadow-soft)}.community-hero h1{margin:8px 0 8px;font-size:clamp(30px,6vw,52px)}.community-hero p{margin:0;color:var(--muted);line-height:1.6}.community-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.community-card{padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.community-card h2,.community-card h3{margin:0 0 7px}.community-card p{margin:0;color:var(--muted);line-height:1.55}.community-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:13px}.community-meta{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.community-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#eef4eb;color:var(--forest);font-size:11px;font-weight:850}.community-chip.warn{background:#fff0c9;color:#75520a}.community-chip.done{background:#dff3e3;color:#1f6740}.community-chip.open{background:#f2e7dc;color:#845229}.community-form{display:grid;gap:12px}.community-form .field textarea{min-height:120px}.community-empty{padding:28px;text-align:center;border:1px dashed var(--line);border-radius:20px;color:var(--muted);background:#fafbf8}.search-box{position:relative;display:flex;gap:9px;margin-top:16px}.search-box input{min-width:0;flex:1;padding:15px 17px;border:1px solid var(--line);border-radius:16px;background:#fff;font-size:16px}.search-box button{padding:0 18px;border:0;border-radius:16px;background:var(--forest);color:#fff;font-weight:900}.search-result{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;text-decoration:none;color:inherit}.search-result-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:var(--soft);color:var(--forest);font-weight:900}.search-result small{color:var(--forest);font-weight:850;text-transform:uppercase;letter-spacing:.06em}.search-result strong{display:block;margin:3px 0}.search-result p{font-size:13px}.message-card{position:relative}.message-card.unread{border-color:#9cbd8c;background:#f8fcf5}.message-card.unread:before{content:"";position:absolute;left:11px;top:21px;width:8px;height:8px;border-radius:50%;background:var(--forest)}.message-card.unread .message-copy{padding-left:13px}.message-card time{display:block;margin-top:8px;color:var(--muted);font-size:11px}.idea-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.idea-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.idea-actions form{margin:0}.support-button{border:1px solid #b8cfad;border-radius:13px;padding:9px 12px;background:#f4f8f1;color:var(--forest);font-weight:900}.comment{padding:13px 0;border-top:1px solid var(--line)}.comment:first-child{border-top:0}.comment strong{display:block}.comment small{color:var(--muted)}.neighbor-examples{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:14px}.neighbor-example{padding:12px;border-radius:15px;background:#f4f8f1;color:#4d5c52;font-size:13px}.kind-badge{font-weight:900}.kind-badge.offer{color:#286842}.kind-badge.seek{color:#9a6414}.civic-list{display:grid;gap:12px}.civic-item{display:grid;gap:8px}.civic-kind{color:var(--forest);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.map-wrap{overflow:hidden;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:var(--shadow-soft)}#public-map{height:min(68vh,620px);min-height:430px}.map-legend{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--line)}.map-legend span{font-size:11px;font-weight:850}.map-note{padding:12px 14px;color:var(--muted);font-size:12px;line-height:1.45}.account-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.account-summary a{text-decoration:none;color:inherit}.account-summary strong{display:block;font-size:24px;color:var(--forest)}
@media(max-width:620px){.community-hero{padding:19px}.search-box{display:grid;grid-template-columns:1fr auto}.search-result{grid-template-columns:auto 1fr}.search-result>.card-arrow{display:none}#public-map{min-height:360px}}
</style>
"""


def _heading(eyebrow: str, title: str, text: str, back: str = "/") -> str:
    return f'<section class="page-heading compact"><a class="back-link" href="{escape(back)}">← Zurück</a><span class="eyebrow">{escape(eyebrow)}</span><h1>{escape(title)}</h1><p>{escape(text)}</p></section>'


def search_page(query: str, results: list[dict]) -> HTMLResponse:
    cards = []
    for item in results:
        cards.append(
            f'<a class="community-card search-result" href="{escape(item["url"])}">'
            f'<span class="search-result-icon">⌕</span><div><small>{escape(item["kind"])}</small>'
            f'<strong>{escape(item["title"])}</strong><p>{escape(item["snippet"])}</p></div>'
            f'<span class="card-arrow">{icon("arrow")}</span></a>'
        )
    body = "".join(cards)
    if query and not cards:
        body = '<div class="community-empty"><strong>Nichts Passendes gefunden.</strong><p>Versuche einen allgemeineren Begriff wie „Müll“, „DGH“, „Feuerwehr“, „Rat“ oder „1256“.</p></div>'
    if not query:
        body = '<div class="community-empty"><strong>Was möchtest du wissen?</strong><p>Die Suche durchsucht Dienste, Veranstaltungen, Bürgerinformationen, Politik, Ideen, Nachbarschaftshilfe und die Ortsgeschichte.</p></div>'
    content = f"""{COMMUNITY_CSS}
{_heading('Intelligente Suche','Was suchst du?','Ein Suchfeld für die gesamte Bürgerplattform.')}
<section class="community-hero"><form class="search-box" method="get" action="/suche"><input name="q" value="{escape(query)}" placeholder="z. B. Müll, DGH, Gemeinderat, Feuerwehr, 1256 …" autofocus><button type="submit">Suchen</button></form></section>
<section class="community-shell">{body}</section>"""
    return page("Suche", content, active="home", body_class="community-view")


def messages_page(messages, unread: int) -> HTMLResponse:
    rows = []
    for item in messages:
        unread_class = " unread" if not getattr(item, "gelesen_am", None) else ""
        created = getattr(item, "erstellt_am", None)
        stamp = created.strftime("%d.%m.%Y · %H:%M") if created else ""
        rows.append(
            f'<article class="community-card message-card{unread_class}"><div class="message-copy">'
            f'<span class="eyebrow">{escape(getattr(item,"sender_label","") or "Ahnsen hilft")}</span>'
            f'<h2>{escape(getattr(item,"subject","") or "Nachricht")}</h2><p>{escape(getattr(item,"body","") or "")}</p>'
            f'<div class="community-actions"><form method="post" action="/nachrichten/{item.id}/gelesen"><button class="secondary-button small-button" type="submit">Als gelesen markieren</button></form>'
            + (f'<a class="secondary-button small-button" href="{escape(getattr(item,"url","") or "/")}">Öffnen</a>' if getattr(item, "url", "") else "")
            + f'</div><time>{escape(stamp)}</time></div></article>'
        )
    if not rows:
        rows.append('<div class="community-empty"><strong>Dein Postfach ist leer.</strong><p>Persönliche Rückmeldungen und Nachrichten der Verwaltung erscheinen hier.</p></div>')
    content = f"""{COMMUNITY_CSS}
{_heading('Mein Ahnsen','Nachrichten',f'{unread} ungelesene Nachricht' if unread == 1 else f'{unread} ungelesene Nachrichten')}
<section class="community-shell">{''.join(rows)}</section>"""
    return page("Nachrichten", content, active="profile", body_class="community-view")


def ideas_page(rows: list[dict], logged_in: bool, message: str = "") -> HTMLResponse:
    cards = []
    for row in rows:
        idea = row["idea"]
        cards.append(
            f'<article class="community-card"><div class="idea-title"><div><span class="eyebrow">{escape(idea.category)}</span><h2>{escape(idea.title)}</h2></div><span class="community-chip">{escape(idea.status)}</span></div>'
            f'<p>{escape(idea.description[:340])}{"…" if len(idea.description) > 340 else ""}</p>'
            f'<div class="community-meta"><span class="community-chip">👍 {row["supports"]} Unterstützer</span><span class="community-chip">💬 {row["comments"]} Kommentare</span></div>'
            f'<a class="secondary-button" href="/ideen/{idea.id}">Idee ansehen</a></article>'
        )
    if not cards:
        cards.append('<div class="community-empty"><strong>Noch keine Ideen eingereicht.</strong><p>Mach den Anfang und bring deinen Vorschlag für Ahnsen ein.</p></div>')
    form = ""
    if logged_in:
        form = """<section class="community-card"><span class="eyebrow">Mitmachen</span><h2>Neue Idee einreichen</h2><p>Beschreibe kurz, was Ahnsen besser machen könnte. Andere können deine Idee anschließend unterstützen und kommentieren.</p><form class="community-form" method="post" action="/ideen"><label class="field"><span>Titel *</span><input name="title" maxlength="180" required placeholder="z. B. Mehr Sitzbänke am Wanderweg"></label><label class="field"><span>Kategorie</span><select name="category"><option>Allgemein</option><option>Kinder & Jugend</option><option>Verkehr</option><option>Umwelt</option><option>Freizeit</option><option>Digitalisierung</option><option>Ortsbild</option></select></label><label class="field"><span>Beschreibung *</span><textarea name="description" minlength="15" maxlength="4000" required></textarea></label><button class="primary-button" type="submit">Idee einreichen</button></form></section>"""
    else:
        form = '<section class="community-card"><h2>Du möchtest eine Idee einreichen?</h2><p>Melde dich mit deinem Bürgerkonto an. Unterstützen und Kommentieren ist ebenfalls nur angemeldet möglich.</p><a class="primary-button" href="/anmelden?next=/ideen">Anmelden</a></section>'
    notice = f'<div class="form-alert success-alert">{escape(message)}</div>' if message else ""
    content = f"""{COMMUNITY_CSS}{_heading('Bürgerbeteiligung','Ideen für Ahnsen','Vorschläge einreichen, gemeinsam unterstützen und konstruktiv diskutieren.')}{notice}<div class="community-grid">{form}<section class="community-shell">{''.join(cards)}</section></div>"""
    return page("Ideen für Ahnsen", content, active="home", body_class="community-view")


def idea_detail_page(data: dict, logged_in: bool, supported: bool = False) -> HTMLResponse:
    idea = data["idea"]
    comment_rows = []
    for comment, user in data["comments"]:
        name = getattr(user, "name", "Bürgerkonto") if user else "Bürgerkonto"
        stamp = comment.erstellt_am.strftime("%d.%m.%Y · %H:%M") if comment.erstellt_am else ""
        comment_rows.append(f'<div class="comment"><strong>{escape(name)}</strong><p>{escape(comment.body)}</p><small>{escape(stamp)}</small></div>')
    comments = "".join(comment_rows) or '<div class="community-empty">Noch keine Kommentare.</div>'
    support = ""
    comment_form = ""
    if logged_in:
        support = f'<form method="post" action="/ideen/{idea.id}/unterstuetzen"><button class="support-button" type="submit">{"✓ Unterstützung zurücknehmen" if supported else "👍 Idee unterstützen"}</button></form>'
        comment_form = f'<form class="community-form" method="post" action="/ideen/{idea.id}/kommentieren"><label class="field"><span>Kommentar</span><textarea name="body" minlength="2" maxlength="1500" required placeholder="Sachlich und respektvoll kommentieren …"></textarea></label><button class="primary-button" type="submit">Kommentieren</button></form>'
    else:
        comment_form = f'<a class="primary-button" href="/anmelden?next=/ideen/{idea.id}">Zum Mitmachen anmelden</a>'
    content = f"""{COMMUNITY_CSS}{_heading('Ideenportal',idea.title,idea.description,'/ideen')}<section class="community-card"><div class="community-meta"><span class="community-chip">{escape(idea.status)}</span><span class="community-chip">👍 {data['supports']} Unterstützer</span><span class="community-chip">💬 {len(data['comments'])} Kommentare</span></div><div class="idea-actions">{support}</div></section><section class="community-card"><h2>Diskussion</h2>{comments}{comment_form}</section>"""
    return page(idea.title, content, active="home", body_class="community-view")


def neighbor_page(rows, logged_in: bool, message: str = "") -> HTMLResponse:
    cards = []
    for post, user in rows:
        name = getattr(user, "name", "Nachbar/in") if user else "Nachbar/in"
        kind_class = "offer" if post.kind == "Biete" else "seek"
        cards.append(
            f'<article class="community-card"><span class="kind-badge {kind_class}">{escape(post.kind)}</span><h2>{escape(post.title)}</h2><div class="community-meta"><span class="community-chip">{escape(post.category)}</span><span class="community-chip">von {escape(name)}</span></div><p>{escape(post.description)}</p>'
            + (f'<form method="post" action="/nachbarschaft/{post.id}/kontakt"><button class="secondary-button" type="submit">Nachricht senden</button></form>' if logged_in else '<a class="secondary-button" href="/anmelden?next=/nachbarschaft">Anmelden für Kontakt</a>')
            + '</article>'
        )
    if not cards:
        cards.append('<div class="community-empty"><strong>Noch keine freigegebenen Beiträge.</strong><p>Neue Beiträge werden vor Veröffentlichung kurz geprüft.</p></div>')
    form = ""
    if logged_in:
        form = """<section class="community-card"><span class="eyebrow">Neuer Beitrag</span><h2>Hilfe suchen oder anbieten</h2><form class="community-form" method="post" action="/nachbarschaft"><label class="field"><span>Ich …</span><select name="kind"><option>Suche</option><option>Biete</option></select></label><label class="field"><span>Kategorie</span><select name="category"><option>Alltag</option><option>Einkauf</option><option>Fahrdienst</option><option>Werkzeug</option><option>Garten</option><option>Tierhilfe</option><option>Gefunden & Verloren</option><option>Sonstiges</option></select></label><label class="field"><span>Titel *</span><input name="title" maxlength="180" required></label><label class="field"><span>Beschreibung *</span><textarea name="description" minlength="10" maxlength="3000" required></textarea></label><button class="primary-button" type="submit">Zur Prüfung einreichen</button></form></section>"""
    else:
        form = '<section class="community-card"><h2>Mitmachen</h2><p>Für eigene Beiträge und Kontakt zu anderen Nachbarn ist ein Bürgerkonto erforderlich.</p><a class="primary-button" href="/anmelden?next=/nachbarschaft">Anmelden</a></section>'
    notice = f'<div class="form-alert success-alert">{escape(message)}</div>' if message else ""
    content = f"""{COMMUNITY_CSS}{_heading('Gemeinschaft','Nachbarschaftshilfe','Unkompliziert Hilfe im Dorf suchen oder selbst Unterstützung anbieten.')}
<section class="community-hero"><h2>Worum geht es hier?</h2><p>Zum Beispiel: „Kann mich jemand zum Arzt fahren?“, „Ich kann beim Einkauf helfen“, „Wer kann eine Leiter verleihen?“, „Katze vermisst“ oder „Schlüssel am Sportplatz gefunden“.</p><div class="neighbor-examples"><div class="neighbor-example">🛒 Einkauf für ältere Nachbarn</div><div class="neighbor-example">🚗 Fahrdienst zum Arzt</div><div class="neighbor-example">🧰 Werkzeug ausleihen</div><div class="neighbor-example">🐾 Tierhilfe & vermisst</div></div></section>{notice}<div class="community-grid">{form}<section class="community-shell">{''.join(cards)}</section></div>"""
    return page("Nachbarschaftshilfe", content, active="home", body_class="community-view")


def politics_page(items) -> HTMLResponse:
    rows = []
    for item in items:
        source = f'<a class="secondary-button small-button" href="{escape(item.source_url)}" target="_blank" rel="noopener">Originalquelle</a>' if item.source_url else ""
        date_chip = f'<span class="community-chip">📅 {escape(item.date_text)}</span>' if item.date_text else ""
        location_chip = f'<span class="community-chip">📍 {escape(item.location)}</span>' if item.location else ""
        rows.append(
            f'<article class="community-card civic-item"><span class="civic-kind">{escape(item.kind)}</span><h2>{escape(item.title)}</h2>'
            f'<div class="community-meta">{date_chip}{location_chip}</div>'
            f'<p>{escape(item.body)}</p>{source}</article>'
        )
    if not rows:
        rows.append('<div class="community-empty"><strong>Noch keine Einträge veröffentlicht.</strong><p>Hier erscheinen künftig Ratssitzungen, Tagesordnungen, Beschlüsse und kommunalpolitische Informationen.</p></div>')
    content = f"""<!-- Politik & Rat -->{COMMUNITY_CSS}{_heading('Transparenz','Politik & Rat','Sitzungen, Beschlüsse und Informationen aus der kommunalen Politik.')}
<section class="community-hero"><div class="community-grid"><div><span class="eyebrow">Nächste Sitzungen</span><h2>Gemeinderat im Blick</h2><p>Termine, Tagesordnungen und Beschlüsse werden hier gebündelt. Externe Originalquellen bleiben verlinkt, wenn sie vorhanden sind.</p></div><div><span class="eyebrow">Verständlich</span><h2>Was wird entschieden?</h2><p>Wichtige Themen können mit einer kurzen Zusammenfassung ergänzt werden, ohne die amtlichen Originalunterlagen zu ersetzen.</p></div></div></section><section class="civic-list">{''.join(rows)}</section>"""
    return page("Politik & Rat", content, active="home", body_class="community-view")


_PUBLIC_MAP_TEMPLATE = r"""
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIINfQ3ynMZqKOLMZIFmbxuQfDVT4I48HcI=" crossorigin="">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<style>
.defect-map-view{display:grid;gap:16px}.defect-overview{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:16px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f5f8f1);box-shadow:var(--shadow-soft)}.defect-overview h2{margin:6px 0 7px;color:var(--forest);font-size:clamp(22px,5vw,32px)}.defect-overview p{margin:0;color:var(--muted);line-height:1.55}.defect-total{display:inline-flex;align-items:center;gap:7px;margin-top:13px;padding:7px 10px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:12px;font-weight:850}.defect-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.defect-stat{appearance:none;border:1px solid var(--line);border-radius:17px;background:#fff;padding:13px 9px;text-align:left;color:inherit;box-shadow:0 7px 20px rgba(25,64,45,.05)}.defect-stat span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:800}.defect-stat strong{display:block;margin-top:5px;font-size:27px;color:var(--forest)}.defect-stat i{width:9px;height:9px;border-radius:50%;display:inline-block}.defect-stat[data-stat="open"] i{background:#b64a42}.defect-stat[data-stat="progress"] i{background:#d49324}.defect-stat[data-stat="done"] i{background:#287052}.defect-stat.active{outline:2px solid var(--forest);outline-offset:1px}
.defect-filter-card{padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(25,64,45,.05)}.defect-filter-row{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;padding:1px}.defect-filter-row+.defect-filter-row{margin-top:9px;padding-top:10px;border-top:1px solid #edf0e9}.defect-filter-row::-webkit-scrollbar{display:none}.defect-filter-label{flex:0 0 auto;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-right:2px}.defect-filter{flex:0 0 auto;border:1px solid #dce4d8;border-radius:999px;background:#f8faf6;color:#4a5e52;padding:8px 11px;font-size:12px;font-weight:850}.defect-filter.active{border-color:var(--forest);background:var(--forest);color:#fff}
.defect-map-card{overflow:hidden;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:0 13px 34px rgba(25,64,45,.08)}.defect-map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line)}.defect-map-toolbar strong{display:block;color:var(--forest)}.defect-map-toolbar small{display:block;margin-top:2px;color:var(--muted)}.defect-map-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.defect-map-action{border:1px solid #d8e2d4;border-radius:12px;background:#f7faf5;color:var(--forest);padding:8px 10px;font-size:12px;font-weight:850}.defect-map-stage{position:relative}.defect-map-stage #public-map{height:min(62vh,560px);min-height:430px;background:linear-gradient(135deg,#edf2e9,#e5ece2)}.defect-map-legend{position:absolute;z-index:500;left:11px;top:11px;display:flex;gap:5px;flex-wrap:wrap;max-width:calc(100% - 90px);pointer-events:none}.defect-map-legend span{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 3px 12px rgba(0,0,0,.09);font-size:10px;font-weight:850;color:#425248}.defect-map-legend i{width:8px;height:8px;border-radius:50%}.defect-map-note{padding:11px 14px;border-top:1px solid var(--line);background:#fbfcf9;color:var(--muted);font-size:11px;line-height:1.45}
.defect-pin{position:relative;width:38px;height:38px;border-radius:50% 50% 50% 12px;transform:rotate(-45deg);display:grid;place-items:center;border:3px solid #fff;background:var(--pin);box-shadow:0 5px 15px rgba(20,42,30,.28)}.defect-pin>span{transform:rotate(45deg);font-size:16px;line-height:1}.defect-marker-wrap{background:transparent!important;border:0!important}.defect-cluster{width:42px;height:42px;display:grid;place-items:center;border:3px solid #fff;border-radius:50%;background:var(--forest);color:#fff;font-size:13px;font-weight:950;box-shadow:0 6px 18px rgba(20,42,30,.28)}
.defect-detail{position:absolute;z-index:650;left:12px;right:12px;bottom:12px;padding:15px 16px;border:1px solid rgba(34,72,52,.14);border-radius:20px;background:rgba(255,255,255,.97);box-shadow:0 14px 36px rgba(19,48,32,.22);backdrop-filter:blur(10px)}.defect-detail[hidden]{display:none!important}.defect-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.defect-detail h3{margin:3px 0 0;color:var(--forest);font-size:18px}.defect-detail-close{width:34px;height:34px;border:0;border-radius:11px;background:#edf2e9;color:var(--forest);font-size:19px}.defect-detail-meta{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.defect-detail p{margin:0;color:#526159;line-height:1.48;font-size:13px}.defect-status-chip,.defect-meta-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.defect-status-chip.open{background:#f8e5e2;color:#8d332e}.defect-status-chip.progress{background:#fff0d2;color:#855c12}.defect-status-chip.done{background:#dff1e4;color:#226640}.defect-meta-chip{background:#eef3eb;color:#53655a}
.defect-list-card{padding:16px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.defect-list-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}.defect-list-head h2{margin:0;color:var(--forest);font-size:19px}.defect-list-head small{color:var(--muted)}.defect-list{display:grid;gap:8px}.defect-list-item{width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:11px 12px;border:1px solid #e4e9e1;border-radius:15px;background:#fbfcfa;text-align:left;color:inherit}.defect-list-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:#edf3e9;font-size:18px}.defect-list-copy{min-width:0}.defect-list-copy strong{display:block;color:#294c39;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-copy span{display:block;margin-top:2px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-side{display:grid;justify-items:end;gap:5px}.defect-empty{padding:20px;border:1px dashed #d7dfd3;border-radius:16px;background:#fafbf8;text-align:center;color:var(--muted)}
@media(max-width:760px){.defect-overview{grid-template-columns:1fr;padding:16px}.defect-map-toolbar{align-items:flex-start;flex-direction:column}.defect-map-actions{justify-content:flex-start;width:100%}.defect-map-action{flex:1}.defect-map-stage #public-map{min-height:410px;height:56vh}.defect-detail{left:8px;right:8px;bottom:8px}.defect-list-item{grid-template-columns:auto 1fr}.defect-list-side{grid-column:2;justify-items:start;grid-auto-flow:column;justify-content:start}.defect-stats{gap:6px}.defect-stat{padding:11px 8px}.defect-stat strong{font-size:23px}}
</style>
<section class="page-heading compact"><a class="back-link" href="/">← Zurück</a><span class="eyebrow">Bürger-Service</span><h1>Öffentliche Mängelkarte</h1><p>Anonymisierte Meldungen aus __MUNICIPALITY__ im Überblick. Positionen sind bewusst nur ungefähr dargestellt.</p></section>
<div class="defect-map-view">
  <section class="defect-overview">
    <div><span class="eyebrow">Aktueller Überblick</span><h2>Was ist gerade gemeldet?</h2><p>Filtere nach Bearbeitungsstand oder Kategorie und tippe eine Meldung auf der Karte oder in der Liste an.</p><span class="defect-total"><span id="defect-total">0</span> Meldungen mit Kartenposition</span></div>
    <div class="defect-stats" aria-label="Meldungen nach Status">
      <button class="defect-stat" type="button" data-stat="open"><span><i></i>Offen</span><strong id="stat-open">0</strong></button>
      <button class="defect-stat" type="button" data-stat="progress"><span><i></i>In Bearbeitung</span><strong id="stat-progress">0</strong></button>
      <button class="defect-stat" type="button" data-stat="done"><span><i></i>Erledigt</span><strong id="stat-done">0</strong></button>
    </div>
  </section>
  <section class="defect-filter-card" aria-label="Mängelkarte filtern">
    <div class="defect-filter-row"><span class="defect-filter-label">Status</span><button class="defect-filter active" type="button" data-status-filter="all">Alle</button><button class="defect-filter" type="button" data-status-filter="open">Offen</button><button class="defect-filter" type="button" data-status-filter="progress">In Bearbeitung</button><button class="defect-filter" type="button" data-status-filter="done">Erledigt</button></div>
    <div class="defect-filter-row" id="defect-category-filters"><span class="defect-filter-label">Kategorie</span></div>
  </section>
  <section class="defect-map-card">
    <div class="defect-map-toolbar"><div><strong>Karte __MUNICIPALITY__</strong><small id="defect-map-state">Öffentliche, gerundete Positionen</small></div><div class="defect-map-actions"><button class="defect-map-action" id="map-center" type="button">◎ Zentrieren</button><button class="defect-map-action" id="map-locate" type="button">⌖ Mein Standort</button><button class="defect-map-action" id="map-reload" type="button">↻ Neu laden</button></div></div>
    <div class="defect-map-stage"><div id="public-map" aria-label="Öffentliche Mängelkarte von __MUNICIPALITY__"></div><div class="defect-map-legend"><span><i style="background:#b64a42"></i>Offen</span><span><i style="background:#d49324"></i>In Bearbeitung</span><span><i style="background:#287052"></i>Erledigt</span></div><aside class="defect-detail" id="defect-detail" hidden aria-live="polite"><div class="defect-detail-head"><div><span class="eyebrow" id="detail-category">Meldung</span><h3 id="detail-title">Meldung</h3></div><button class="defect-detail-close" id="detail-close" type="button" aria-label="Detail schließen">×</button></div><div class="defect-detail-meta"><span class="defect-status-chip" id="detail-status"></span><span class="defect-meta-chip" id="detail-location"></span><span class="defect-meta-chip" id="detail-date"></span></div><p id="detail-description"></p></aside></div>
    <div class="defect-map-note">Datenschutz: GPS-Positionen werden vor der Veröffentlichung gerundet. Hausnummern, Namen, Kontaktdaten, interne Notizen und private Fotos werden nicht veröffentlicht. Der Marker zeigt daher keinen exakten Standort.</div>
  </section>
  <section class="defect-list-card"><div class="defect-list-head"><div><span class="eyebrow">Kartenausschnitt</span><h2>Sichtbare Meldungen</h2></div><small id="defect-visible-count">0 sichtbar</small></div><div class="defect-list" id="defect-list"><div class="defect-empty">Meldungen werden geladen …</div></div></section>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
(() => {
  const points = __POINTS__.map((point,index)=>({...point,_key:String(point.id || `p-${index}`)}));
  const center = [__CENTER_LAT__, __CENTER_LON__];
  const defaultZoom = __CENTER_ZOOM__;
  const map = L.map('public-map',{zoomControl:true}).setView(center,defaultZoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap-Mitwirkende'}).addTo(map);
  const state = {status:'all',category:'all'};
  const markerByKey = new Map();
  let userLayer = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normal = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const statusKey = value => { const v=normal(value); if(v.includes('erledigt')||v.includes('geschlossen')||v.includes('behoben')) return 'done'; if(v.includes('bearbeit')||v.includes('pruf')||v.includes('weitergeleitet')) return 'progress'; return 'open'; };
  const statusLabel = key => key==='done'?'Erledigt':key==='progress'?'In Bearbeitung':'Offen';
  const statusColor = key => key==='done'?'#287052':key==='progress'?'#d49324':'#b64a42';
  const glyph = category => { const v=normal(category); if(v.includes('licht')||v.includes('laterne')||v.includes('beleucht')) return '💡'; if(v.includes('mull')||v.includes('abfall')) return '♻'; if(v.includes('strasse')||v.includes('straße')||v.includes('schlagloch')||v.includes('gehweg')) return '◆'; if(v.includes('schild')||v.includes('verkehr')) return '△'; if(v.includes('grun')||v.includes('baum')||v.includes('hecke')) return '❧'; return '!'; };
  const cluster = typeof L.markerClusterGroup === 'function' ? L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:46,spiderfyOnMaxZoom:true,iconCreateFunction:c=>L.divIcon({className:'',html:`<span class="defect-cluster">${c.getChildCount()}</span>`,iconSize:[42,42],iconAnchor:[21,21]})}) : L.layerGroup();
  cluster.addTo(map);
  const filtered = () => points.filter(p => (state.status==='all'||statusKey(p.status)===state.status) && (state.category==='all'||p.category===state.category));
  const pointDate = p => { const time=Date.parse(p.date||''); return Number.isFinite(time)?time:0; };
  const makeMarker = p => { const sk=statusKey(p.status); const html=`<span class="defect-pin" style="--pin:${statusColor(sk)}"><span>${glyph(p.category)}</span></span>`; const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'defect-marker-wrap',html,iconSize:[38,44],iconAnchor:[19,40]}),title:p.category||'Meldung'}); marker.on('click',()=>showDetail(p)); markerByKey.set(p._key,marker); return marker; };
  const showDetail = p => { const sk=statusKey(p.status); document.getElementById('detail-category').textContent=p.category||'Meldung'; document.getElementById('detail-title').textContent=p.category||'Meldung'; const status=document.getElementById('detail-status'); status.className=`defect-status-chip ${sk}`; status.textContent=statusLabel(sk); document.getElementById('detail-location').textContent=`📍 ${p.ort||'__MUNICIPALITY__'}`; document.getElementById('detail-date').textContent=p.date_label?`📅 ${p.date_label}`:'📅 Datum nicht verfügbar'; document.getElementById('detail-description').textContent='Der freie Meldetext bleibt aus Datenschutzgründen nicht öffentlich. Kategorie, Bearbeitungsstand, Datum und ungefährer Ort sind hier sichtbar.'; document.getElementById('defect-detail').hidden=false; };
  const hideDetail = () => { document.getElementById('defect-detail').hidden=true; };
  const renderMarkers = (fit=false) => { cluster.clearLayers(); markerByKey.clear(); const items=filtered(); items.forEach(p=>cluster.addLayer(makeMarker(p))); document.getElementById('defect-map-state').textContent=`${items.length} Meldung${items.length===1?'':'en'} im aktuellen Filter · Positionen gerundet`; if(fit && items.length){ const bounds=L.latLngBounds(items.map(p=>[p.lat,p.lon])); if(bounds.isValid()) map.fitBounds(bounds.pad(.18),{maxZoom:15}); } renderVisibleList(); hideDetail(); };
  const renderVisibleList = () => { const bounds=map.getBounds(); const items=filtered().filter(p=>bounds.contains([p.lat,p.lon])).sort((a,b)=>pointDate(b)-pointDate(a)); const list=document.getElementById('defect-list'); document.getElementById('defect-visible-count').textContent=`${items.length} sichtbar`; if(!items.length){ list.innerHTML='<div class="defect-empty"><strong>Keine Meldung im aktuellen Kartenausschnitt.</strong><br>Zoome heraus oder ändere den Filter.</div>'; return; } list.innerHTML=items.map(p=>{ const sk=statusKey(p.status); return `<button class="defect-list-item" type="button" data-point-key="${esc(p._key)}"><span class="defect-list-icon">${glyph(p.category)}</span><span class="defect-list-copy"><strong>${esc(p.category||'Meldung')}</strong><span>${esc(p.ort||'__MUNICIPALITY__')}</span></span><span class="defect-list-side"><span class="defect-status-chip ${sk}">${statusLabel(sk)}</span><span class="defect-meta-chip">${esc(p.date_label||'ohne Datum')}</span></span></button>`; }).join(''); list.querySelectorAll('[data-point-key]').forEach(button=>button.addEventListener('click',()=>focusPoint(button.dataset.pointKey))); };
  const focusPoint = key => { const p=points.find(item=>item._key===key); const marker=markerByKey.get(key); if(!p||!marker) return; const reveal=()=>{map.flyTo([p.lat,p.lon],Math.max(map.getZoom(),16),{duration:.45}); showDetail(p);}; if(typeof cluster.zoomToShowLayer==='function') cluster.zoomToShowLayer(marker,reveal); else reveal(); };
  const setStatus = key => { state.status=key; document.querySelectorAll('[data-status-filter]').forEach(b=>b.classList.toggle('active',b.dataset.statusFilter===key)); document.querySelectorAll('[data-stat]').forEach(b=>b.classList.toggle('active',key!=='all'&&b.dataset.stat===key)); renderMarkers(true); };
  const setCategory = category => { state.category=category; document.querySelectorAll('[data-category-filter]').forEach(b=>b.classList.toggle('active',b.dataset.categoryFilter===category)); renderMarkers(true); };
  const counts={open:0,progress:0,done:0}; points.forEach(p=>counts[statusKey(p.status)]++); document.getElementById('stat-open').textContent=counts.open; document.getElementById('stat-progress').textContent=counts.progress; document.getElementById('stat-done').textContent=counts.done; document.getElementById('defect-total').textContent=points.length;
  document.querySelectorAll('[data-status-filter]').forEach(button=>button.addEventListener('click',()=>setStatus(button.dataset.statusFilter))); document.querySelectorAll('[data-stat]').forEach(button=>button.addEventListener('click',()=>setStatus(state.status===button.dataset.stat?'all':button.dataset.stat)));
  const categoryWrap=document.getElementById('defect-category-filters'); const allCategory=document.createElement('button'); allCategory.className='defect-filter active'; allCategory.type='button'; allCategory.dataset.categoryFilter='all'; allCategory.textContent='Alle'; categoryWrap.appendChild(allCategory); [...new Set(points.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de')).forEach(category=>{ const button=document.createElement('button'); button.className='defect-filter'; button.type='button'; button.dataset.categoryFilter=category; button.textContent=category; categoryWrap.appendChild(button); }); categoryWrap.querySelectorAll('[data-category-filter]').forEach(button=>button.addEventListener('click',()=>setCategory(button.dataset.categoryFilter)));
  document.getElementById('detail-close').addEventListener('click',hideDetail); document.getElementById('map-center').addEventListener('click',()=>{map.setView(center,defaultZoom);hideDetail();}); document.getElementById('map-reload').addEventListener('click',()=>window.location.reload()); document.getElementById('map-locate').addEventListener('click',()=>{ const button=document.getElementById('map-locate'); if(!navigator.geolocation){button.textContent='Standort nicht verfügbar';return;} button.disabled=true;button.textContent='⌖ Standort wird ermittelt …'; navigator.geolocation.getCurrentPosition(position=>{ if(userLayer) map.removeLayer(userLayer); const lat=position.coords.latitude,lon=position.coords.longitude; userLayer=L.layerGroup([L.circle([lat,lon],{radius:Math.min(Math.max(position.coords.accuracy||30,20),400),color:'#2767a6',weight:1,fillOpacity:.08}),L.circleMarker([lat,lon],{radius:7,color:'#fff',weight:3,fillColor:'#2767a6',fillOpacity:1}).bindTooltip('Dein Standort')]).addTo(map); map.setView([lat,lon],16); button.disabled=false;button.textContent='⌖ Mein Standort'; },()=>{button.disabled=false;button.textContent='⌖ Standort nicht verfügbar';setTimeout(()=>button.textContent='⌖ Mein Standort',2200);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000}); });
  map.on('moveend',renderVisibleList); map.on('click',hideDetail); renderMarkers(points.length>0);
})();
</script>
"""


def public_map_page(points: list[dict]) -> HTMLResponse:
    cfg = get_platform_snapshot()
    safe_points = json.dumps(points, ensure_ascii=False).replace("</", "<\\/")
    try:
        center_lat = float(cfg.get("map_lat") or 52.258)
        center_lon = float(cfg.get("map_lon") or 9.099)
        center_zoom = int(cfg.get("map_zoom") or 15)
    except (TypeError, ValueError):
        center_lat, center_lon, center_zoom = 52.258, 9.099, 15
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    html = (
        _PUBLIC_MAP_TEMPLATE
        .replace("__POINTS__", safe_points)
        .replace("__MUNICIPALITY__", municipality)
        .replace("__CENTER_LAT__", f"{center_lat:.6f}")
        .replace("__CENTER_LON__", f"{center_lon:.6f}")
        .replace("__CENTER_ZOOM__", str(center_zoom))
    )
    return page("Mängelkarte", COMMUNITY_CSS + html, active="home", body_class="community-view")


def language_panel(current: str = "de") -> str:
    options = "".join(f'<option value="{escape(code)}"{" selected" if code == current else ""}>{escape(label)}</option>' for code, label in SUPPORTED_LANGUAGES.items())
    return f'<label class="language-picker"><span class="sr-only">Sprache</span><select id="platform-language" aria-label="Sprache auswählen">{options}</select></label>'
