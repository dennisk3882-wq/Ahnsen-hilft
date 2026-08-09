from __future__ import annotations

import json
from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from community_crud import SUPPORTED_LANGUAGES
from council_members import get_current_council_members
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


def politics_page(items, ratsinfo: dict | None = None) -> HTMLResponse:
    ratsinfo = ratsinfo or {}
    cfg = get_platform_snapshot()
    municipality = str(cfg.get("municipality_name") or "Ahnsen")
    meetings = list(ratsinfo.get("meetings") or [])
    query = str(ratsinfo.get("query") or "")
    selected_year = ratsinfo.get("selected_year")
    years = list(ratsinfo.get("years") or [])
    archive_mode = ratsinfo.get("mode") == "local" and bool(ratsinfo.get("available"))
    auto_mode = ratsinfo.get("mode") == "oparl" and bool(ratsinfo.get("available"))
    data_mode = archive_mode or auto_mode
    council = get_current_council_members()
    council_members = list(council.get("members") or [])
    council_member_cards = []
    for member in council_members:
        party = str(member.get("party") or "–")
        party_key = "spd" if party.startswith("SPD") else "cdu" if party.startswith("CDU") else "other"
        role = str(member.get("role") or "Ratsmitglied")
        note = str(member.get("note") or "").strip()
        role_badge = f'<span class="council-role">{escape(role)}</span>' if role != "Ratsmitglied" else ""
        note_html = f'<p class="council-person-note">{escape(note)}</p>' if note else ""
        council_member_cards.append(
            f"""<article class="council-person">
              <div class="council-person-head"><span class="council-party {party_key}">{escape(party)}</span>{role_badge}</div>
              <h3>{escape(str(member.get('name') or 'Ratsmitglied'))}</h3>
              <div class="council-person-facts"><span><small>Alter</small><strong>{escape(str(member.get('age') or 'nicht öffentlich verifiziert'))}</strong></span><span><small>Wohnort</small><strong>{escape(str(member.get('residence') or municipality))}</strong></span></div>
              {note_html}
            </article>"""
        )
    council_members_area = "".join(council_member_cards)

    def document_buttons(documents: list[dict]) -> str:
        buttons = []
        for document in documents:
            name = escape(str(document.get("name") or document.get("kind") or "Dokument"))
            kind = escape(str(document.get("kind") or "Dokument"))
            download = escape(str(document.get("download_url") or document.get("url") or ""), quote=True)
            if not download:
                continue
            local = bool(document.get("local"))
            attrs = ' download' if local else ' target="_blank" rel="noopener"'
            label = "PDF aus dem lokalen Ratsarchiv herunterladen" if local else "Originaldatei der Samtgemeinde herunterladen ↗"
            buttons.append(
                f'<a class="council-doc download" href="{download}"{attrs}><span>↓</span><span><small>{kind}</small><strong>{name}</strong><em>{label}</em></span></a>'
            )
        return "".join(buttons)

    def agenda_block(agenda: list[dict]) -> str:
        if not agenda:
            return ""
        rows = []
        for item in agenda:
            number = escape(str(item.get("number") or ""))
            name = escape(str(item.get("name") or "Tagesordnungspunkt"))
            result = escape(str(item.get("result") or ""))
            resolution = escape(str(item.get("resolution_text") or ""))
            resolution_file = item.get("resolution_file") if isinstance(item.get("resolution_file"), dict) else None
            extra = ""
            if result:
                extra += f'<p><strong>Ergebnis:</strong> {result}</p>'
            if resolution:
                extra += f'<p><strong>Beschluss:</strong> {resolution}</p>'
            if resolution_file:
                extra += '<div class="council-doc-grid compact">' + document_buttons([resolution_file]) + '</div>'
            rows.append(
                f'<article class="agenda-row"><span class="agenda-number">{number or "•"}</span><div><strong>{name}</strong>{extra}</div></article>'
            )
        return f'<details class="agenda-details"><summary>Tagesordnung ansehen <span>{len(rows)} öffentliche Punkte</span></summary><div class="agenda-list">{"".join(rows)}</div></details>'

    meeting_cards = []
    for meeting in meetings:
        documents = list(meeting.get("documents") or [])
        agenda = list(meeting.get("agenda") or [])
        organization = str(meeting.get("organization") or f"Gemeinderat {municipality}")
        location = str(meeting.get("location") or "")
        document_area = document_buttons(documents)
        summary = str(meeting.get("summary") or "")
        archive_note = "Die veröffentlichten PDF-Unterlagen liegen im lokalen Ratsarchiv von Ahnsen hilft und werden direkt von dieser PWA ausgeliefert." if archive_mode else "Alle Sitzungsdetails bleiben in Ahnsen hilft. Nur ein Dokument-Download öffnet die amtliche Originaldatei."
        meeting_cards.append(
            f"""<article class="council-meeting-card">
                <div class="council-date-box"><strong>{escape(str(meeting.get("date_label") or "Termin"))}</strong><small>{escape(str(meeting.get("time_label") or ""))}</small></div>
                <div class="council-meeting-main">
                    <span class="civic-kind">{escape(organization or "Ratssitzung")}</span>
                    <h2>{escape(str(meeting.get("name") or "Ratssitzung"))}</h2>
                    <div class="community-meta">
                        {f'<span class="community-chip">📍 {escape(location)}</span>' if location else ''}
                        <span class="community-chip">Amtliche Quelle</span>
                    </div>
                    {f'<p>{escape(summary)}</p>' if summary else ''}
                    <div class="council-internal-note">{escape(archive_note)}</div>
                    {f'<div class="council-doc-grid">{document_area}</div>' if document_area else '<p class="council-doc-empty">Für diese Sitzung ist noch kein öffentliches PDF hinterlegt.</p>'}
                    {agenda_block(agenda)}
                </div>
            </article>"""
        )

    if meeting_cards:
        meeting_area = "".join(meeting_cards)
    elif data_mode:
        meeting_area = '<div class="community-empty"><strong>Keine Sitzung im gewählten Filter gefunden.</strong><p>Ändere Jahr oder Suchbegriff. Neu archivierte Sitzungen erscheinen hier automatisch.</p></div>'
    else:
        meeting_area = """<section class="council-source-empty">
            <div class="council-source-icon">🏛️</div>
            <div><strong>Das 5-Jahres-Archiv ist technisch vorbereitet</strong><p>Die Navigation, Suche und Jahresfilter bleiben vollständig in Ahnsen hilft. Für den automatischen Import der amtlichen Sitzungen fehlt derzeit eine freigegebene maschinenlesbare Schnittstelle der Samtgemeinde. Deshalb werden hier keine unvollständigen oder erfundenen Sitzungsdaten angezeigt.</p><p class="council-source-detail">Sobald eine offizielle Datenquelle freigeschaltet ist, erscheinen die Ahnsener Sitzungen der letzten fünf Jahre hier automatisch. Die Originaldateien werden dann ausschließlich über ihre direkten amtlichen Download-Links bereitgestellt.</p></div>
        </section>"""

    local_rows = []
    for item in items:
        source = ""
        date_chip = f'<span class="community-chip">📅 {escape(item.date_text)}</span>' if item.date_text else ""
        location_chip = f'<span class="community-chip">📍 {escape(item.location)}</span>' if item.location else ""
        local_rows.append(
            f'<article class="community-card civic-item"><span class="civic-kind">{escape(item.kind)}</span><h2>{escape(item.title)}</h2>'
            f'<div class="community-meta">{date_chip}{location_chip}</div>'
            f'<p>{escape(item.body)}</p>{source}</article>'
        )
    local_area = "".join(local_rows) or '<div class="community-empty"><strong>Noch keine redaktionellen Hinweise.</strong><p>Dieser Bereich kann von der Verwaltung für verständliche Ergänzungen und kommunalpolitische Informationen genutzt werden.</p></div>'

    year_links = ['<a class="council-year' + (' active' if not selected_year else '') + f'" href="/politik-rat?q={escape(query, quote=True)}">Alle</a>']
    for year in years:
        active = " active" if selected_year == year else ""
        year_links.append(f'<a class="council-year{active}" href="/politik-rat?jahr={year}&q={escape(query, quote=True)}">{year}</a>')

    if archive_mode:
        source_badge = '<span class="community-chip done">● Lokales Ratsarchiv aktiv</span>'
        status_text = f'{ratsinfo.get("meeting_count_all", len(meetings))} veröffentlichte Sitzungen im lokalen Archiv.'
    elif auto_mode:
        source_badge = '<span class="community-chip done">● Amtliche Sitzungsdaten automatisch synchronisiert</span>'
        status_text = f'{ratsinfo.get("meeting_count_all", len(meetings))} Sitzungen aus der amtlichen Schnittstelle verfügbar.'
    else:
        source_badge = '<span class="community-chip warn">● Ratsarchiv wird aufgebaut</span>'
        status_text = 'Die Oberfläche bleibt vollständig in Ahnsen hilft.'

    styles = """
    <style>
    .council-portal{display:grid;gap:16px;min-width:0;width:100%;max-width:100%;overflow-x:hidden}.council-portal>*{min-width:0;max-width:100%}.council-members-panel{min-width:0;width:100%;max-width:100%;padding:18px;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.council-members-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.council-members-head h2{margin:3px 0 3px;color:var(--forest);font-size:22px}.council-members-head p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.council-members-count{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:#eef4eb;color:var(--forest);font-size:11px;font-weight:900}.council-member-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(215px,100%),1fr));gap:9px;min-width:0;width:100%;max-width:100%}.council-person{min-width:0;max-width:100%;padding:13px;border:1px solid #e0e8dc;border-radius:17px;background:#f9fbf7}.council-person-head{display:flex;align-items:center;justify-content:space-between;gap:7px}.council-party,.council-role{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:950;letter-spacing:.04em}.council-party.spd{color:#8a2d32;background:#fae7e8}.council-party.cdu{color:#343b38;background:#e9ece9}.council-party.other{color:#345843;background:#e4efe5}.council-role{color:var(--forest);background:#e5f0e1}.council-person h3{margin:8px 0 9px;color:#284c39;font-size:17px}.council-person-facts{display:grid;grid-template-columns:1fr 1fr;gap:7px}.council-person-facts span{min-width:0;padding:7px 8px;border-radius:11px;background:#fff}.council-person-facts small,.council-person-facts strong{display:block}.council-person-facts small{color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.council-person-facts strong{margin-top:3px;color:#46574d;font-size:10px;line-height:1.3}.council-person-note{margin:8px 0 0!important;color:#68756d!important;font-size:10px!important;line-height:1.4!important}.council-members-foot{margin-top:10px;padding-top:9px;border-top:1px solid #edf1ea;color:var(--muted);font-size:10px;line-height:1.45}.council-source{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:14px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f2f7ef);box-shadow:var(--shadow-soft)}.council-source h2{margin:5px 0 7px;color:var(--forest);font-size:clamp(23px,5vw,32px)}.council-source p{margin:0;color:var(--muted);line-height:1.55}.council-source-side{display:grid;align-content:center;gap:9px;padding:14px;border:1px solid #dce6d8;border-radius:18px;background:rgba(255,255,255,.78)}.council-source-side strong{color:var(--forest)}.council-source-side small{color:var(--muted);line-height:1.45}.council-source-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    .council-filter{padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(25,64,45,.05)}.council-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.council-search input{min-width:0;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:#fbfcfa;font-size:15px}.council-search button{border:0;border-radius:14px;padding:0 17px;background:var(--forest);color:#fff;font-weight:900}.council-years{display:flex;gap:7px;overflow-x:auto;margin-top:11px;padding-bottom:2px;scrollbar-width:none}.council-years::-webkit-scrollbar{display:none}.council-year{flex:0 0 auto;padding:7px 10px;border:1px solid #dce4d8;border-radius:999px;background:#f8faf6;color:#526158;text-decoration:none;font-size:11px;font-weight:900}.council-year.active{border-color:var(--forest);background:var(--forest);color:#fff}
    .council-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:2px 1px}.council-section-head h2{margin:3px 0 0;color:var(--forest)}.council-section-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.council-result-count{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:#eef4eb;color:var(--forest);font-size:11px;font-weight:900}.council-meetings{display:grid;gap:12px}.council-meeting-card{display:grid;grid-template-columns:112px minmax(0,1fr);gap:15px;padding:17px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.council-date-box{align-self:start;display:grid;gap:4px;padding:12px;border-radius:16px;background:#edf4e9;color:var(--forest);text-align:center}.council-date-box strong{font-size:15px}.council-date-box small{color:#647268;font-size:11px}.council-meeting-main{min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:normal}.council-meeting-main h2{margin:4px 0 7px;color:var(--forest);font-size:20px}.council-actions{margin:10px 0}.council-doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px}.council-doc-grid.compact{grid-template-columns:minmax(0,330px);margin-top:8px}.council-doc{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;min-width:0;max-width:100%;padding:10px;border:1px solid #dfe7db;border-radius:14px;background:#f8faf6;color:inherit;text-decoration:none}.council-doc>span:first-child{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#e9f1e5;color:var(--forest);font-weight:900}.council-doc small,.council-doc strong{display:block}.council-doc small{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.council-doc strong{margin-top:2px;color:#31513f;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.council-doc em{display:block;margin-top:4px;color:var(--forest);font-size:10px;font-style:normal;font-weight:850}.council-doc.download{background:#f3f7ef}.council-internal-note{margin:10px 0;padding:9px 11px;border-radius:13px;background:#f4f8f1;color:#526158;font-size:11px;line-height:1.45}.council-doc-empty{margin:10px 0 0!important;font-size:12px!important}.agenda-details{margin-top:13px;border-top:1px solid #e7ece4;padding-top:11px}.agenda-details summary{cursor:pointer;color:var(--forest);font-weight:900}.agenda-details summary span{margin-left:5px;color:var(--muted);font-size:10px;font-weight:800}.agenda-list{display:grid;gap:0;margin-top:9px}.agenda-row{display:grid;grid-template-columns:35px minmax(0,1fr);gap:9px;padding:10px 0;border-top:1px solid #edf0ea}.agenda-row:first-child{border-top:0}.agenda-number{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#eef3eb;color:var(--forest);font-size:10px;font-weight:900}.agenda-row p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
    .council-source-empty{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center;padding:18px;border:1px dashed #b9cbb4;border-radius:20px;background:#f8faf5}.council-source-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:#eaf2e6;font-size:23px}.council-source-empty p{margin:4px 0 0;color:var(--muted);line-height:1.5}.council-source-empty .council-source-detail{margin-top:8px;font-size:11px}.council-editorial{padding-top:17px;border-top:1px solid var(--line)}
    @media(max-width:720px){.council-members-panel{padding:15px}.council-members-head{align-items:flex-start;flex-wrap:wrap}.council-member-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible;scroll-snap-type:none;padding-bottom:0}.council-person{width:auto;max-width:100%;overflow:hidden}.council-person-facts{grid-template-columns:1fr}.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr;min-width:0;max-width:100%}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:minmax(0,1fr)}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:minmax(0,1fr) auto}.council-filter,.council-source,.council-meetings,.council-meeting-card,.council-editorial{min-width:0;width:100%;max-width:100%}}
    @media(max-width:430px){.council-member-grid{grid-template-columns:1fr}.council-person-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.council-search{grid-template-columns:minmax(0,1fr)}.council-search button{min-height:44px}.council-source-links{display:grid}.council-result-count{display:none}.council-members-count{white-space:nowrap}.council-doc strong,.council-person h3,.council-person-facts strong{overflow-wrap:anywhere;white-space:normal}}
    </style>
    """

    content = f"""{COMMUNITY_CSS}{styles}
    {_heading('Transparenz','Politik & Rat',f'Sitzungen, Tagesordnungen, Protokolle und Beschlüsse für {municipality}.')}
    <div class="council-portal">
      <section class="council-members-panel">
        <div class="council-members-head"><div><span class="eyebrow">Aktueller Gemeinderat</span><h2>Ratsmitglieder in Ahnsen</h2><p>Wahlperiode {escape(str(council.get('term') or '2021–2026'))} · öffentlich verifizierter Stand {escape(str(council.get('verified_at') or ''))}</p></div><span class="council-members-count">{len(council_members)} Mitglieder</span></div>
        <div class="council-member-grid">{council_members_area}</div>
        <div class="council-members-foot">Wohnorte werden aus Datenschutzgründen ausschließlich auf Ortsebene angezeigt. Altersangaben erscheinen nur, wenn sie aktuell öffentlich belastbar belegt sind. „Partei/Ratsliste“ bezeichnet die politische Zuordnung bzw. die Liste, über die das laufende Ratsmandat erworben wurde.</div>
      </section>
      <section class="council-source">
        <div><span class="eyebrow">Amtliche Ratsinformationen</span><h2>Gemeinderat {escape(municipality)} im Überblick</h2><p>Durchsuche Sitzungen, öffentliche Tagesordnungen, Beschlüsse und Niederschriften direkt hier in Ahnsen hilft. Du verlässt den Politikbereich nur dann, wenn du bewusst eine amtliche Originaldatei herunterlädst.</p><div class="community-meta">{source_badge}</div></div>
        <div class="council-source-side"><span class="eyebrow">Datenstatus</span><strong>{'Lokales 5-Jahres-Archiv aktiv' if archive_mode else ('5-Jahres-Archiv aktiv' if auto_mode else 'Ratsarchiv wird aufgebaut')}</strong><small>{escape(status_text)}</small><small>Zeitraum: etwa {ratsinfo.get('lookback_years', 5)} Jahre · Filter: {escape(str(ratsinfo.get('organization_match') or municipality))}</small></div>
      </section>
      <section class="council-filter"><form class="council-search" method="get" action="/politik-rat"><input type="search" name="q" maxlength="120" value="{escape(query, quote=True)}" placeholder="Sitzungen durchsuchen, z. B. Haushalt, Straße, DGH …"><input type="hidden" name="jahr" value="{escape(str(selected_year or ''), quote=True)}"><button type="submit">Suchen</button></form><div class="council-years">{''.join(year_links)}</div></section>
      <div class="council-section-head"><div><span class="eyebrow">Sitzungsarchiv</span><h2>Amtliche Sitzungen & Dokumente</h2><p>{'Gespeicherte öffentliche Sitzungen und PDF-Unterlagen – vollständig innerhalb von Ahnsen hilft.' if archive_mode else ('Gefilterte Ergebnisse aus der amtlichen Schnittstelle – vollständig innerhalb von Ahnsen hilft.' if auto_mode else 'Suche und Jahresfilter bleiben hier in Ahnsen hilft.')}</p></div><span class="council-result-count">{len(meetings)} Treffer</span></div>
      <section class="council-meetings">{meeting_area}</section>
      <section class="council-editorial"><div class="council-section-head"><div><span class="eyebrow">Zusätzliche Informationen</span><h2>Hinweise aus der Gemeinde</h2><p>Redaktionelle Erläuterungen ergänzen die amtlichen Unterlagen, ersetzen sie aber nicht.</p></div></div><div class="civic-list">{local_area}</div></section>
    </div>"""
    return page("Politik & Rat", content, active="home", body_class="community-view")


_PUBLIC_MAP_TEMPLATE = r"""
<link href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" rel="stylesheet">
<style>
.defect-map-view{display:grid;gap:16px;min-width:0}.defect-overview{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:16px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f5f8f1);box-shadow:var(--shadow-soft)}.defect-overview h2{margin:6px 0 7px;color:var(--forest);font-size:clamp(22px,5vw,32px)}.defect-overview p{margin:0;color:var(--muted);line-height:1.55}.defect-total{display:inline-flex;align-items:center;gap:7px;margin-top:13px;padding:7px 10px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:12px;font-weight:850}.defect-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.defect-stat{appearance:none;border:1px solid var(--line);border-radius:17px;background:#fff;padding:13px 9px;text-align:left;color:inherit;box-shadow:0 7px 20px rgba(25,64,45,.05)}.defect-stat span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:800}.defect-stat strong{display:block;margin-top:5px;font-size:27px;color:var(--forest)}.defect-stat i{width:9px;height:9px;border-radius:50%;display:inline-block}.defect-stat[data-stat="open"] i{background:#b64a42}.defect-stat[data-stat="progress"] i{background:#d49324}.defect-stat[data-stat="done"] i{background:#287052}.defect-stat.active{outline:2px solid var(--forest);outline-offset:1px}
.defect-filter-card{min-width:0;padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(25,64,45,.05);overflow:hidden}.defect-filter-row{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;padding:1px;max-width:100%}.defect-filter-row+.defect-filter-row{margin-top:9px;padding-top:10px;border-top:1px solid #edf0e9}.defect-filter-row::-webkit-scrollbar{display:none}.defect-filter-label{flex:0 0 auto;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-right:2px}.defect-filter{flex:0 0 auto;border:1px solid #dce4d8;border-radius:999px;background:#f8faf6;color:#4a5e52;padding:8px 11px;font-size:12px;font-weight:850}.defect-filter.active{border-color:var(--forest);background:var(--forest);color:#fff}
.defect-map-card{position:relative;isolation:isolate;contain:layout paint;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:0 13px 34px rgba(25,64,45,.08)}.defect-map-toolbar{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line);background:#fff}.defect-map-toolbar strong{display:block;color:var(--forest)}.defect-map-toolbar small{display:block;margin-top:2px;color:var(--muted)}.defect-map-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.defect-map-action{border:1px solid #d8e2d4;border-radius:12px;background:#f7faf5;color:var(--forest);padding:8px 10px;font-size:12px;font-weight:850;min-height:42px}.defect-map-stage{position:relative;isolation:isolate;overflow:hidden;width:100%;height:clamp(390px,58vh,540px);background:#eaf0e7}.defect-map-stage #public-map{position:absolute;inset:0;width:100%;height:100%;min-width:0;overflow:hidden}.defect-map-stage .maplibregl-map,.defect-map-stage .maplibregl-canvas-container,.defect-map-stage .maplibregl-canvas{max-width:none!important}.defect-map-stage .maplibregl-map{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;overflow:hidden!important}.defect-map-stage .maplibregl-canvas{position:absolute!important;inset:0!important}.defect-map-stage .maplibregl-control-container{position:absolute;inset:0;pointer-events:none}.defect-map-stage .maplibregl-ctrl{pointer-events:auto}.defect-map-stage .maplibregl-ctrl-top-right{top:10px;right:10px}.defect-map-stage .maplibregl-ctrl-group{border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(20,42,30,.15)}.defect-map-stage .maplibregl-ctrl-attrib{font-size:9px;background:rgba(255,255,255,.9)}.defect-map-legend{position:absolute;z-index:4;left:10px;top:10px;display:flex;gap:5px;flex-wrap:wrap;max-width:calc(100% - 80px);pointer-events:none}.defect-map-legend span{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.78);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 3px 12px rgba(0,0,0,.09);font-size:10px;font-weight:850;color:#425248}.defect-map-legend i{width:8px;height:8px;border-radius:50%}.defect-map-note{position:relative;z-index:5;padding:11px 14px;border-top:1px solid var(--line);background:#fbfcf9;color:var(--muted);font-size:11px;line-height:1.45}
.defect-detail{position:absolute;z-index:6;left:10px;right:10px;bottom:10px;max-height:55%;overflow:auto;padding:15px 16px;border:1px solid rgba(34,72,52,.14);border-radius:20px;background:rgba(255,255,255,.97);box-shadow:0 14px 36px rgba(19,48,32,.22);backdrop-filter:blur(10px)}.defect-detail[hidden]{display:none!important}.defect-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.defect-detail h3{margin:3px 0 0;color:var(--forest);font-size:18px}.defect-detail-close{width:34px;height:34px;flex:0 0 34px;border:0;border-radius:11px;background:#edf2e9;color:var(--forest);font-size:19px}.defect-detail-meta{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.defect-detail p{margin:0;color:#526159;line-height:1.48;font-size:13px}.defect-status-chip,.defect-meta-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.defect-status-chip.open{background:#f8e5e2;color:#8d332e}.defect-status-chip.progress{background:#fff0d2;color:#855c12}.defect-status-chip.done{background:#dff1e4;color:#226640}.defect-meta-chip{background:#eef3eb;color:#53655a}
.defect-list-card{min-width:0;padding:16px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.defect-list-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}.defect-list-head h2{margin:0;color:var(--forest);font-size:19px}.defect-list-head small{color:var(--muted)}.defect-list{display:grid;gap:8px}.defect-list-item{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:center;padding:11px 12px;border:1px solid #e4e9e1;border-radius:15px;background:#fbfcfa;text-align:left;color:inherit}.defect-list-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:#edf3e9;font-size:18px}.defect-list-copy{min-width:0}.defect-list-copy strong{display:block;color:#294c39;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-copy span{display:block;margin-top:2px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-side{display:grid;justify-items:end;gap:5px}.defect-empty{padding:20px;border:1px dashed #d7dfd3;border-radius:16px;background:#fafbf8;text-align:center;color:var(--muted)}
@media(max-width:760px){.defect-overview{grid-template-columns:1fr;padding:16px}.defect-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.defect-stat{padding:11px 8px}.defect-stat strong{font-size:23px}.defect-map-toolbar{align-items:flex-start;flex-direction:column}.defect-map-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;gap:7px}.defect-map-action{width:100%;padding:8px 6px}.defect-map-stage{height:min(52vh,470px);min-height:390px}.defect-list-item{grid-template-columns:auto minmax(0,1fr)}.defect-list-side{grid-column:2;justify-items:start;grid-auto-flow:column;justify-content:start}.defect-map-legend{right:58px;max-width:none}.defect-map-stage .maplibregl-ctrl-top-right{top:52px}.defect-detail{left:8px;right:8px;bottom:8px}}
@media(max-width:430px){.defect-map-stage{height:400px;min-height:400px}.defect-map-actions{grid-template-columns:1fr 1fr 1fr}.defect-map-action{font-size:11px}.defect-map-legend span{font-size:9px;padding:5px 7px}}
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
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script>
(() => {
  const rawPoints = __POINTS__.map((point,index)=>({...point,_key:String(point.id || `p-${index}`)}));
  const center = [__CENTER_LON__, __CENTER_LAT__];
  const defaultZoom = __CENTER_ZOOM__;
  const state = {status:'all',category:'all'};
  let userMarker = null;
  const userAccuracyId = 'user-location-accuracy';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normal = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const statusKey = value => { const v=normal(value); if(v.includes('erledigt')||v.includes('geschlossen')||v.includes('behoben')) return 'done'; if(v.includes('bearbeit')||v.includes('pruf')||v.includes('weitergeleitet')) return 'progress'; return 'open'; };
  const statusLabel = key => key==='done'?'Erledigt':key==='progress'?'In Bearbeitung':'Offen';
  const glyph = category => { const v=normal(category); if(v.includes('licht')||v.includes('laterne')||v.includes('beleucht')) return '💡'; if(v.includes('mull')||v.includes('abfall')) return '♻'; if(v.includes('strasse')||v.includes('straße')||v.includes('schlagloch')||v.includes('gehweg')) return '◆'; if(v.includes('schild')||v.includes('verkehr')) return '△'; if(v.includes('grun')||v.includes('baum')||v.includes('hecke')) return '❧'; return '!'; };
  const pointDate = p => { const time=Date.parse(p.date||''); return Number.isFinite(time)?time:0; };
  const filtered = () => rawPoints.filter(p => (state.status==='all'||statusKey(p.status)===state.status) && (state.category==='all'||p.category===state.category));
  const geojson = items => ({type:'FeatureCollection',features:items.map(p=>({type:'Feature',id:p._key,properties:{key:p._key,status:statusKey(p.status),category:p.category||'Meldung',ort:p.ort||'__MUNICIPALITY__',date_label:p.date_label||'',glyph:glyph(p.category),date:p.date||''},geometry:{type:'Point',coordinates:[Number(p.lon),Number(p.lat)]}}))});

  if (typeof maplibregl === 'undefined') {
    document.getElementById('defect-map-state').textContent='Kartenmodul konnte nicht geladen werden';
    document.getElementById('public-map').innerHTML='<div class="defect-empty" style="margin:16px">Die Karte konnte nicht geladen werden. Bitte Internetverbindung prüfen und die Seite neu öffnen.</div>';
    return;
  }

  const map = new maplibregl.Map({container:'public-map',style:'https://tiles.openfreemap.org/styles/liberty',center,zoom:defaultZoom,minZoom:11,maxZoom:19,attributionControl:true,cooperativeGestures:true,pitchWithRotate:false,dragRotate:false,touchPitch:false,fadeDuration:0});
  map.addControl(new maplibregl.NavigationControl({showCompass:false,showZoom:true}),'top-right');

  const showDetailByKey = key => { const p=rawPoints.find(item=>item._key===String(key)); if(!p) return; const sk=statusKey(p.status); document.getElementById('detail-category').textContent=p.category||'Meldung'; document.getElementById('detail-title').textContent=p.category||'Meldung'; const status=document.getElementById('detail-status'); status.className=`defect-status-chip ${sk}`; status.textContent=statusLabel(sk); document.getElementById('detail-location').textContent=`📍 ${p.ort||'__MUNICIPALITY__'}`; document.getElementById('detail-date').textContent=p.date_label?`📅 ${p.date_label}`:'📅 Datum nicht verfügbar'; document.getElementById('detail-description').textContent='Der freie Meldetext bleibt aus Datenschutzgründen nicht öffentlich. Kategorie, Bearbeitungsstand, Datum und ungefährer Ort sind hier sichtbar.'; document.getElementById('defect-detail').hidden=false; };
  const hideDetail = () => { document.getElementById('defect-detail').hidden=true; };
  const boundsFor = items => { if(!items.length) return null; const bounds=new maplibregl.LngLatBounds(); items.forEach(p=>bounds.extend([Number(p.lon),Number(p.lat)])); return bounds; };
  const updateMapSource = (fit=false) => { const items=filtered(); const source=map.getSource('reports'); if(source) source.setData(geojson(items)); document.getElementById('defect-map-state').textContent=`${items.length} Meldung${items.length===1?'':'en'} im aktuellen Filter · Positionen gerundet`; if(fit && items.length){ const bounds=boundsFor(items); map.fitBounds(bounds,{padding:55,maxZoom:15,duration:450}); } renderVisibleList(); hideDetail(); };
  const renderVisibleList = () => { const bounds=map.getBounds(); const items=filtered().filter(p=>bounds.contains([Number(p.lon),Number(p.lat)])).sort((a,b)=>pointDate(b)-pointDate(a)); const list=document.getElementById('defect-list'); document.getElementById('defect-visible-count').textContent=`${items.length} sichtbar`; if(!items.length){ list.innerHTML='<div class="defect-empty"><strong>Keine Meldung im aktuellen Kartenausschnitt.</strong><br>Zoome heraus oder ändere den Filter.</div>'; return; } list.innerHTML=items.map(p=>{ const sk=statusKey(p.status); return `<button class="defect-list-item" type="button" data-point-key="${esc(p._key)}"><span class="defect-list-icon">${glyph(p.category)}</span><span class="defect-list-copy"><strong>${esc(p.category||'Meldung')}</strong><span>${esc(p.ort||'__MUNICIPALITY__')}</span></span><span class="defect-list-side"><span class="defect-status-chip ${sk}">${statusLabel(sk)}</span><span class="defect-meta-chip">${esc(p.date_label||'ohne Datum')}</span></span></button>`; }).join(''); list.querySelectorAll('[data-point-key]').forEach(button=>button.addEventListener('click',()=>focusPoint(button.dataset.pointKey))); };
  const focusPoint = key => { const p=rawPoints.find(item=>item._key===String(key)); if(!p) return; map.easeTo({center:[Number(p.lon),Number(p.lat)],zoom:Math.max(map.getZoom(),16),duration:450}); showDetailByKey(key); };
  const setStatus = key => { state.status=key; document.querySelectorAll('[data-status-filter]').forEach(b=>b.classList.toggle('active',b.dataset.statusFilter===key)); document.querySelectorAll('[data-stat]').forEach(b=>b.classList.toggle('active',key!=='all'&&b.dataset.stat===key)); updateMapSource(true); };
  const setCategory = category => { state.category=category; document.querySelectorAll('[data-category-filter]').forEach(b=>b.classList.toggle('active',b.dataset.categoryFilter===category)); updateMapSource(true); };

  const counts={open:0,progress:0,done:0}; rawPoints.forEach(p=>counts[statusKey(p.status)]++); document.getElementById('stat-open').textContent=counts.open; document.getElementById('stat-progress').textContent=counts.progress; document.getElementById('stat-done').textContent=counts.done; document.getElementById('defect-total').textContent=rawPoints.length;
  document.querySelectorAll('[data-status-filter]').forEach(button=>button.addEventListener('click',()=>setStatus(button.dataset.statusFilter))); document.querySelectorAll('[data-stat]').forEach(button=>button.addEventListener('click',()=>setStatus(state.status===button.dataset.stat?'all':button.dataset.stat)));
  const categoryWrap=document.getElementById('defect-category-filters'); const allCategory=document.createElement('button'); allCategory.className='defect-filter active'; allCategory.type='button'; allCategory.dataset.categoryFilter='all'; allCategory.textContent='Alle'; categoryWrap.appendChild(allCategory); [...new Set(rawPoints.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de')).forEach(category=>{ const button=document.createElement('button'); button.className='defect-filter'; button.type='button'; button.dataset.categoryFilter=category; button.textContent=category; categoryWrap.appendChild(button); }); categoryWrap.querySelectorAll('[data-category-filter]').forEach(button=>button.addEventListener('click',()=>setCategory(button.dataset.categoryFilter)));

  map.on('load',()=>{
    map.addSource('reports',{type:'geojson',data:geojson(filtered()),cluster:true,clusterMaxZoom:14,clusterRadius:46});
    map.addLayer({id:'report-clusters',type:'circle',source:'reports',filter:['has','point_count'],paint:{'circle-color':'#174936','circle-radius':['step',['get','point_count'],18,10,22,25,26],'circle-stroke-width':3,'circle-stroke-color':'#ffffff','circle-opacity':.94}});
    map.addLayer({id:'report-cluster-count',type:'symbol',source:'reports',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':12},paint:{'text-color':'#ffffff'}});
    map.addLayer({id:'report-points',type:'circle',source:'reports',filter:['!', ['has','point_count']],paint:{'circle-radius':10,'circle-color':['match',['get','status'],'done','#287052','progress','#d49324','#b64a42'],'circle-stroke-width':3,'circle-stroke-color':'#ffffff'}});
    map.addLayer({id:'report-point-symbol',type:'symbol',source:'reports',filter:['!', ['has','point_count']],layout:{'text-field':['get','glyph'],'text-size':13,'text-allow-overlap':true},paint:{'text-color':'#ffffff'}});
    map.on('click','report-clusters',async e=>{ const feature=e.features&&e.features[0]; if(!feature) return; const clusterId=feature.properties.cluster_id; const source=map.getSource('reports'); try{ const zoom=await source.getClusterExpansionZoom(clusterId); map.easeTo({center:feature.geometry.coordinates,zoom,duration:350}); }catch(_){ } });
    map.on('click','report-points',e=>{ const feature=e.features&&e.features[0]; if(feature) showDetailByKey(feature.properties.key); });
    map.on('mouseenter','report-clusters',()=>map.getCanvas().style.cursor='pointer'); map.on('mouseleave','report-clusters',()=>map.getCanvas().style.cursor=''); map.on('mouseenter','report-points',()=>map.getCanvas().style.cursor='pointer'); map.on('mouseleave','report-points',()=>map.getCanvas().style.cursor='');
    if(rawPoints.length){ const bounds=boundsFor(rawPoints); map.fitBounds(bounds,{padding:55,maxZoom:15,duration:0}); }
    setTimeout(()=>{map.resize();renderVisibleList();},80);
  });
  map.on('moveend',renderVisibleList);
  map.on('click',e=>{ const features=map.queryRenderedFeatures(e.point,{layers:['report-points','report-clusters']}); if(!features.length) hideDetail(); });
  map.on('error',e=>{ if(e&&e.error) console.warn('MapLibre:',e.error); });

  const resizeMap=()=>requestAnimationFrame(()=>map.resize()); window.addEventListener('resize',resizeMap,{passive:true}); window.addEventListener('orientationchange',()=>setTimeout(resizeMap,180),{passive:true}); document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(resizeMap,80);}); window.addEventListener('pageshow',()=>setTimeout(resizeMap,80));
  document.getElementById('detail-close').addEventListener('click',hideDetail); document.getElementById('map-center').addEventListener('click',()=>{map.easeTo({center,zoom:defaultZoom,duration:350});hideDetail();}); document.getElementById('map-reload').addEventListener('click',()=>window.location.reload());
  document.getElementById('map-locate').addEventListener('click',()=>{ const button=document.getElementById('map-locate'); if(!navigator.geolocation){button.textContent='Standort nicht verfügbar';return;} button.disabled=true; button.textContent='⌖ Wird ermittelt …'; navigator.geolocation.getCurrentPosition(position=>{ const lat=position.coords.latitude,lon=position.coords.longitude,accuracy=Math.min(Math.max(position.coords.accuracy||30,20),400); if(userMarker) userMarker.remove(); userMarker=new maplibregl.Marker({color:'#2767a6'}).setLngLat([lon,lat]).setPopup(new maplibregl.Popup({offset:18}).setText('Dein Standort')).addTo(map); const point={type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{}}; if(map.getSource(userAccuracyId)){map.getSource(userAccuracyId).setData(point);}else{ map.addSource(userAccuracyId,{type:'geojson',data:point}); map.addLayer({id:userAccuracyId+'-halo',type:'circle',source:userAccuracyId,paint:{'circle-radius':Math.max(10,Math.min(36,accuracy/6)),'circle-color':'#2767a6','circle-opacity':.12,'circle-stroke-width':1,'circle-stroke-color':'#2767a6'}}); } map.easeTo({center:[lon,lat],zoom:16,duration:450}); button.disabled=false;button.textContent='⌖ Mein Standort'; },()=>{button.disabled=false;button.textContent='⌖ Nicht verfügbar';setTimeout(()=>button.textContent='⌖ Mein Standort',2200);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000}); });
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
