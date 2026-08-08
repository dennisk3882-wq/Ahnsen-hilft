from __future__ import annotations

import json
from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from community_crud import SUPPORTED_LANGUAGES
from pwa_ui import icon, page


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


def public_map_page(points: list[dict]) -> HTMLResponse:
    safe_points = json.dumps(points, ensure_ascii=False).replace("</", "<\\/")
    content = f"""{COMMUNITY_CSS}
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIINfQ3ynMZqKOLMZIFmbxuQfDVT4I48HcI=" crossorigin="">
{_heading('Digitaler Ortsplan','Mängelkarte','Öffentlich sichtbare Meldungen werden datensparsam und nur mit ungefährer Position dargestellt.')}
<section class="map-wrap"><div class="map-legend"><span>🔴 Offen</span><span>🟡 In Bearbeitung</span><span>🟢 Erledigt</span></div><div id="public-map" aria-label="Karte von Ahnsen"></div><div class="map-note">Zum Schutz von Privatsphäre und Wohnadressen werden GPS-Positionen öffentlich gerundet. Namen, Kontaktdaten, interne Notizen und Fotos werden nicht angezeigt.</div></section>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>(()=>{{const points={safe_points};const map=L.map('public-map').setView([52.258,9.099],15);L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{maxZoom:19,attribution:'&copy; OpenStreetMap-Mitwirkende'}}).addTo(map);const colors={{'Offen':'#b64a42','In Bearbeitung':'#c78a1b','Erledigt':'#287052'}};points.forEach(p=>{{const marker=L.circleMarker([p.lat,p.lon],{{radius:8,color:colors[p.status]||'#174936',weight:3,fillOpacity:.72}}).addTo(map);marker.bindPopup(`<strong>${{p.art}}</strong><br>${{p.ort}}<br><small>${{p.status}}</small>`);}});if(points.length){{const bounds=L.latLngBounds(points.map(p=>[p.lat,p.lon]));if(bounds.isValid())map.fitBounds(bounds.pad(.15),{{maxZoom:16}});}}}})();</script>"""
    return page("Mängelkarte", content, active="home", body_class="community-view")


def language_panel(current: str = "de") -> str:
    options = "".join(f'<option value="{escape(code)}"{" selected" if code == current else ""}>{escape(label)}</option>' for code, label in SUPPORTED_LANGUAGES.items())
    return f'<label class="language-picker"><span class="sr-only">Sprache</span><select id="platform-language" aria-label="Sprache auswählen">{options}</select></label>'
