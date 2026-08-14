from __future__ import annotations

import json
from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from platform_runtime import get_platform_snapshot


def _page(title: str, active: str, body: str) -> HTMLResponse:
    html = f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)} · {escape(get_platform_snapshot()["platform_name"])} Verwaltung</title><style>{intern_nav_css()}
.admin-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}}.admin-card{{padding:18px;border:1px solid var(--admin-line);border-radius:20px;background:var(--admin-paper);box-shadow:var(--admin-shadow-soft)}}.admin-card h2,.admin-card h3{{margin:0 0 8px}}.admin-card p{{color:var(--admin-muted);line-height:1.5}}.metric strong{{display:block;font-size:34px;color:var(--admin-forest)}}.metric span{{color:var(--admin-muted);font-size:12px;font-weight:800}}.admin-section{{margin-top:18px;padding:20px;border:1px solid var(--admin-line);border-radius:22px;background:rgba(255,254,250,.95);box-shadow:var(--admin-shadow-soft)}}.admin-list{{display:grid;gap:9px}}.admin-row{{padding:13px;border:1px solid var(--admin-line);border-radius:15px;background:#fff}}.admin-row small{{color:var(--admin-muted)}}.admin-row form{{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}}.admin-form{{display:grid;gap:12px}}.admin-form input,.admin-form textarea,.admin-form select{{width:100%;padding:11px 12px;border:1px solid var(--admin-line);border-radius:12px;background:#fff;font:inherit}}.admin-form textarea{{min-height:110px}}.admin-button{{border:0;border-radius:12px;padding:10px 14px;background:var(--admin-forest);color:#fff;font-weight:850;cursor:pointer}}.admin-button.secondary{{border:1px solid var(--admin-line);background:#fff;color:var(--admin-forest)}}.admin-search{{display:flex;gap:8px}}.admin-search input{{flex:1}}.admin-table{{width:100%;border-collapse:collapse}}.admin-table th,.admin-table td{{padding:10px 8px;text-align:left;border-bottom:1px solid var(--admin-line);vertical-align:top}}.admin-table th{{font-size:11px;text-transform:uppercase;color:var(--admin-muted)}}.status-chip{{display:inline-flex;padding:5px 8px;border-radius:999px;background:#edf3e9;color:var(--admin-forest);font-size:11px;font-weight:850}}.json-box{{white-space:pre-wrap;padding:12px;border-radius:14px;background:#f5f7f1;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}}@media(max-width:720px){{.admin-table{{display:block;overflow:auto}}.admin-search{{display:grid}}}}
</style></head><body><div class="container">{intern_nav(active)}{body}</div></body></html>"""
    return HTMLResponse(html)


def cockpit_page(stats: dict) -> HTMLResponse:
    reports = stats.get("reports", {})
    cards = [
        (stats.get("users", 0), "aktive Bürgerkonten"),
        (reports.get("offen", 0), "offene Mängel"),
        (reports.get("bearbeitung", 0), "Mängel in Bearbeitung"),
        (stats.get("neighbor_pending", 0), "Nachbarschaftsbeiträge prüfen"),
        (stats.get("ideas", 0), "Ideen im Portal"),
        (stats.get("messages_unread", 0), "ungelesene Bürgernachrichten"),
        (stats.get("events", 0), "aktive Veranstaltungen"),
        (stats.get("dgh_total", 0), "DGH-Einträge"),
    ]
    metrics = "".join(f'<article class="admin-card metric"><strong>{int(value)}</strong><span>{escape(label)}</span></article>' for value, label in cards)
    tasks = []
    if reports.get("offen", 0): tasks.append(f'{reports.get("offen",0)} offene Mängel prüfen')
    if stats.get("neighbor_pending", 0): tasks.append(f'{stats["neighbor_pending"]} Nachbarschaftsbeiträge moderieren')
    if stats.get("ideas_month", 0): tasks.append(f'{stats["ideas_month"]} neue Ideen in diesem Monat')
    if not tasks: tasks.append('Aktuell keine auffälligen offenen Aufgaben aus den neuen Modulen.')
    task_html = "".join(f'<div class="admin-row">{escape(item)}</div>' for item in tasks)
    body = f"""<section><span class="eyebrow">Verwaltungs-Dashboard 2.0</span><h1>Digitales Cockpit</h1><p>Ein gemeinsamer Überblick über Bürgerkonten, Vorgänge, Beteiligung und Betrieb.</p></section><section class="admin-grid">{metrics}</section><section class="admin-section"><h2>Heute im Blick</h2><div class="admin-list">{task_html}</div></section><section class="admin-section"><h2>Schnellzugriff</h2><div class="admin-grid"><a class="admin-card" href="/intern/nachrichten"><h3>Nachrichten</h3><p>Persönliche Nachrichten an Bürgerkonten senden.</p></a><a class="admin-card" href="/intern/ideen"><h3>Ideenportal</h3><p>Status von Bürgerideen pflegen.</p></a><a class="admin-card" href="/intern/nachbarschaft"><h3>Nachbarschaft</h3><p>Neue Beiträge prüfen und freigeben.</p></a><a class="admin-card" href="/intern/politik"><h3>Politik & Rat</h3><p>Sitzungen, Beschlüsse und Hinweise veröffentlichen.</p></a><a class="admin-card" href="/intern/berichte"><h3>Berichte</h3><p>Digitalberichte erzeugen und durchsuchen.</p></a><a class="admin-card" href="/intern/audit"><h3>Audit-Log</h3><p>Administrative Änderungen nachvollziehen.</p></a></div></section>"""
    return _page("Digitales Cockpit", "cockpit", body)


def admin_messages_page(users, recent_messages, message: str = "") -> HTMLResponse:
    options = "".join(f'<option value="{u.id}">{escape(u.name)} · {escape(u.email)}</option>' for u in users)
    rows = "".join(
        f'<div class="admin-row"><strong>{escape(m.subject)}</strong><br><small>an Nutzer #{m.user_id} · {m.erstellt_am.strftime("%d.%m.%Y %H:%M") if m.erstellt_am else ""}</small><p>{escape(m.body)}</p></div>'
        for m in recent_messages[:50]
    ) or '<div class="admin-row">Noch keine Nachrichten.</div>'
    notice = f'<div class="admin-row">{escape(message)}</div>' if message else ""
    body = f"""<section><span class="eyebrow">Digitaler Briefkasten</span><h1>Nachrichten</h1><p>Persönliche Mitteilungen landen im geschützten Bürgerkonto. Browser-Push weist auf neue Nachrichten hin, ohne den vollständigen Inhalt offen anzuzeigen.</p></section>{notice}<section class="admin-grid"><article class="admin-section"><h2>Nachricht senden</h2><form class="admin-form" method="post" action="/intern/nachrichten"><label>Empfänger<select name="user_id" required><option value="">Bitte wählen</option>{options}</select></label><label>Betreff<input name="subject" maxlength="180" required></label><label>Nachricht<textarea name="body" maxlength="5000" required></textarea></label><button class="admin-button" type="submit">Nachricht zustellen</button></form></article><article class="admin-section"><h2>Letzte Nachrichten</h2><div class="admin-list">{rows}</div></article></section>"""
    return _page("Nachrichten", "nachrichten", body)


def admin_ideas_page(rows) -> HTMLResponse:
    cards = []
    statuses = ["Eingereicht", "Wird geprüft", "Umsetzbar", "Geplant", "Umgesetzt", "Nicht umsetzbar"]
    for row in rows:
        idea = row["idea"]
        options = "".join(f'<option{" selected" if s == idea.status else ""}>{escape(s)}</option>' for s in statuses)
        cards.append(f'<div class="admin-row"><strong>#{idea.id} · {escape(idea.title)}</strong><br><small>{escape(idea.category)} · {row["supports"]} Unterstützer · {row["comments"]} Kommentare</small><p>{escape(idea.description)}</p><form method="post" action="/intern/ideen/{idea.id}/status"><select name="status">{options}</select><button class="admin-button" type="submit">Status speichern</button></form></div>')
    body = f'<section><span class="eyebrow">Bürgerbeteiligung</span><h1>Ideenportal</h1></section><section class="admin-section"><div class="admin-list">{"".join(cards) or "<div class=admin-row>Noch keine Ideen.</div>"}</div></section>'
    return _page("Ideenportal", "ideen", body)


def admin_neighbor_page(rows) -> HTMLResponse:
    cards = []
    for post, user in rows:
        name = getattr(user, "name", "Unbekannt") if user else "Unbekannt"
        options = "".join(f'<option{" selected" if s == post.status else ""}>{s}</option>' for s in ("Prüfung", "Freigegeben", "Erledigt", "Abgelehnt"))
        cards.append(f'<div class="admin-row"><strong>#{post.id} · {escape(post.kind)} · {escape(post.title)}</strong><br><small>{escape(post.category)} · von {escape(name)}</small><p>{escape(post.description)}</p><form method="post" action="/intern/nachbarschaft/{post.id}/status"><select name="status">{options}</select><button class="admin-button" type="submit">Status speichern</button></form></div>')
    body = f'<section><span class="eyebrow">Moderation</span><h1>Nachbarschaftshilfe</h1><p>Neue Beiträge werden vor öffentlicher Anzeige geprüft.</p></section><section class="admin-section"><div class="admin-list">{"".join(cards) or "<div class=admin-row>Keine Beiträge.</div>"}</div></section>'
    return _page("Nachbarschaftshilfe", "nachbarschaft", body)


def admin_politics_page(items, archive=None, message: str = "") -> HTMLResponse:
    archive = list(archive or [])
    notice = f'<div class="admin-row"><strong>{escape(message)}</strong></div>' if message else ""
    archive_cards = []
    kinds = ("Niederschrift / Protokoll", "Einladung / Tagesordnung", "Beschluss", "Vorlage", "Anlage", "Sonstiges Dokument")
    kind_options = "".join(f'<option>{escape(kind)}</option>' for kind in kinds)
    for meeting in archive:
        documents = []
        for doc in meeting.get("documents") or []:
            mb = int(doc.get("size_bytes") or 0) / (1024 * 1024)
            index_badge = "Text indexiert" if doc.get("text_indexed") else "PDF gespeichert"
            documents.append(
                f'<div class="admin-row"><strong>📄 {escape(str(doc.get("kind") or "Dokument"))} · {escape(str(doc.get("title") or doc.get("filename") or "PDF"))}</strong>'
                f'<br><small>{mb:.2f} MB · {index_badge}</small><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">'
                f'<a class="admin-button secondary" href="/politik-rat/dokument/{int(doc["id"])}">PDF herunterladen</a>'
                f'<form method="post" action="/intern/politik/dokument/{int(doc["id"])}/loeschen" onsubmit="return confirm(\'Dokument wirklich löschen?\')"><button class="admin-button secondary" type="submit">Löschen</button></form></div></div>'
            )
        docs_html = "".join(documents) or '<div class="admin-row">Noch kein PDF hinterlegt.</div>'
        checked = " checked" if meeting.get("published") else ""
        archive_cards.append(f"""<article class="admin-section">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><span class="status-chip">{escape(str(meeting.get("date_label") or ""))}</span><h2>{escape(str(meeting.get("title") or "Ratssitzung"))}</h2><small>{escape(str(meeting.get("organization") or ""))} · {escape(str(meeting.get("location") or ""))}</small></div><form method="post" action="/intern/politik/archiv/{int(meeting["id"])}/loeschen" onsubmit="return confirm('Sitzung inklusive aller PDFs wirklich löschen?')"><button class="admin-button secondary" type="submit">Sitzung löschen</button></form></div>
          <details style="margin-top:14px"><summary><strong>Sitzung bearbeiten</strong></summary><form class="admin-form" method="post" action="/intern/politik/archiv/{int(meeting["id"])}" style="margin-top:12px"><label>Datum<input type="date" name="meeting_date" value="{escape(str(meeting.get("date") or ""))}" required></label><label>Uhrzeit<input type="time" name="meeting_time" value="{escape(str(meeting.get("time") or ""))}"></label><label>Titel<input name="title" maxlength="300" value="{escape(str(meeting.get("title") or ""), quote=True)}" required></label><label>Gremium<input name="organization" maxlength="200" value="{escape(str(meeting.get("organization") or "Gemeinderat Ahnsen"), quote=True)}"></label><label>Ort<input name="location" maxlength="240" value="{escape(str(meeting.get("location") or ""), quote=True)}"></label><label>Kurzbeschreibung / Hinweise<textarea name="summary" maxlength="12000">{escape(str(meeting.get("summary") or ""))}</textarea></label><label>Amtliche Quellseite<input name="source_url" maxlength="1000" value="{escape(str(meeting.get("source_url") or ""), quote=True)}"></label><label><input type="checkbox" name="published"{checked}> Öffentlich anzeigen</label><button class="admin-button" type="submit">Sitzung speichern</button></form></details>
          <h3 style="margin-top:18px">Dokumente</h3><div class="admin-list">{docs_html}</div>
          <details style="margin-top:14px"><summary><strong>Weitere PDF hinzufügen</strong></summary><form class="admin-form" method="post" enctype="multipart/form-data" action="/intern/politik/archiv/{int(meeting["id"])}/dokument" style="margin-top:12px"><label>Dokumenttyp<select name="document_kind">{kind_options}</select></label><label>Dokumenttitel<input name="document_title" maxlength="300" placeholder="optional – sonst Dateiname"></label><label>PDF-Datei(en)<input type="file" name="documents" accept="application/pdf,.pdf" multiple></label><label>Oder direkte öffentliche PDF-URL<input type="url" name="document_url" maxlength="1000" placeholder="https://…pdf"></label><label>Originalquelle des Dokuments<input type="url" name="document_source_url" maxlength="1000"></label><button class="admin-button" type="submit">PDF speichern</button></form></details>
        </article>""")
    archive_html = "".join(archive_cards) or '<div class="admin-row"><strong>Noch keine Sitzung im lokalen Archiv.</strong><p>Lege oben die erste Sitzung an und lade die veröffentlichten PDF-Unterlagen hoch.</p></div>'

    rows = "".join(f'<div class="admin-row"><strong>{escape(i.kind)} · {escape(i.title)}</strong><br><small>{escape(i.date_text)} {escape(i.location)}</small><p>{escape(i.body)}</p></div>' for i in items) or '<div class="admin-row">Noch keine redaktionellen Einträge.</div>'
    body = f"""<section><span class="eyebrow">Transparenz</span><h1>Politik & Rat</h1><p>Lokales Ratsarchiv für öffentliche Sitzungen, Einladungen, Tagesordnungen und Protokolle.</p></section>{notice}
    <section class="admin-section"><span class="eyebrow">Lokales Ratsarchiv</span><h2>Neue Sitzung archivieren</h2><p>Die PDFs werden dauerhaft in der PWA-Datenbank gespeichert. Beim Upload wird der PDF-Text automatisch für die Suche indexiert.</p><form class="admin-form" method="post" enctype="multipart/form-data" action="/intern/politik/archiv"><label>Datum *<input type="date" name="meeting_date" required></label><label>Uhrzeit<input type="time" name="meeting_time"></label><label>Titel *<input name="title" maxlength="300" value="Sitzung des Gemeinderates Ahnsen" required></label><label>Gremium<input name="organization" maxlength="200" value="Gemeinderat Ahnsen"></label><label>Ort<input name="location" maxlength="240" placeholder="z. B. Dorfgemeinschaftshaus Ahnsen"></label><label>Kurzbeschreibung / Hinweise<textarea name="summary" maxlength="12000"></textarea></label><label>Amtliche Quellseite<input type="url" name="source_url" maxlength="1000" placeholder="optional"></label><hr><label>Dokumenttyp<select name="document_kind">{kind_options}</select></label><label>Dokumenttitel<input name="document_title" maxlength="300" placeholder="optional – sonst Dateiname"></label><label>PDF-Datei(en)<input type="file" name="documents" accept="application/pdf,.pdf" multiple></label><label>Oder direkte öffentliche PDF-URL<input type="url" name="document_url" maxlength="1000" placeholder="https://…pdf"></label><label>Originalquelle des Dokuments<input type="url" name="document_source_url" maxlength="1000"></label><label><input type="checkbox" name="published" checked> Sofort öffentlich anzeigen</label><button class="admin-button" type="submit">Sitzung & PDFs speichern</button></form></section>
    <section><span class="eyebrow">Archivbestand</span><h2>Gespeicherte Ratssitzungen</h2>{archive_html}</section>
    <section class="admin-grid"><article class="admin-section"><h2>Zusätzlichen Hinweis veröffentlichen</h2><form class="admin-form" method="post" action="/intern/politik"><label>Typ<select name="kind"><option>Sitzung</option><option>Beschluss</option><option>Tagesordnung</option><option>Bekanntmachung</option><option>Information</option></select></label><label>Titel<input name="title" maxlength="200" required></label><label>Datum / Zeit<input name="date_text" maxlength="80"></label><label>Ort<input name="location" maxlength="160"></label><label>Beschreibung<textarea name="body" maxlength="6000"></textarea></label><label>Originalquelle / URL<input name="source_url" maxlength="500"></label><button class="admin-button" type="submit">Veröffentlichen</button></form></article><article class="admin-section"><h2>Redaktionelle Einträge</h2><div class="admin-list">{rows}</div></article></section>"""
    return _page("Politik & Rat", "politik", body)


def audit_page(logs, search: str = "") -> HTMLResponse:
    rows = "".join(f'<tr><td>{l.erstellt_am.strftime("%d.%m.%Y %H:%M:%S") if l.erstellt_am else ""}</td><td>{escape(l.actor)}</td><td>{escape(l.action)}</td><td>{escape(l.object_type)} {escape(l.object_id)}</td><td>{escape(l.detail)}</td></tr>' for l in logs)
    body = f"""<section><span class="eyebrow">Nachvollziehbarkeit</span><h1>Audit-Log</h1><p>Administrative und sicherheitsrelevante Änderungen werden nachvollziehbar protokolliert.</p></section><section class="admin-section"><form class="admin-search" method="get"><input name="q" value="{escape(search)}" placeholder="Aktion, Objekt oder Detail suchen"><button class="admin-button" type="submit">Suchen</button></form><table class="admin-table"><thead><tr><th>Zeit</th><th>Akteur</th><th>Aktion</th><th>Objekt</th><th>Detail</th></tr></thead><tbody>{rows}</tbody></table></section>"""
    return _page("Audit-Log", "audit", body)


def reports_page(reports, search: str = "") -> HTMLResponse:
    cards = []
    for report in reports:
        try:
            pretty = json.dumps(json.loads(report.body), ensure_ascii=False, indent=2)
        except Exception:
            pretty = report.body
        cards.append(f'<article class="admin-row"><strong>{escape(report.title)}</strong><br><small>{report.erstellt_am.strftime("%d.%m.%Y %H:%M") if report.erstellt_am else ""}</small><div class="json-box">{escape(pretty)}</div></article>')
    body = f"""<section><span class="eyebrow">Auswertungen</span><h1>Berichte</h1><p>Gespeicherte Digitalberichte lassen sich durchsuchen und später exportieren.</p></section><section class="admin-section"><form class="admin-form" method="post" action="/intern/berichte/erstellen"><label>Berichtsmonat<input name="period_key" placeholder="YYYY-MM"></label><button class="admin-button" type="submit">Bericht erzeugen</button></form></section><section class="admin-section"><form class="admin-search" method="get"><input name="q" value="{escape(search)}" placeholder="Berichte durchsuchen"><button class="admin-button" type="submit">Suchen</button></form><div class="admin-list">{"".join(cards) or "<div class=admin-row>Noch keine Berichte gespeichert.</div>"}</div></section>"""
    return _page("Berichte", "berichte", body)


def platform_settings_page(config) -> HTMLResponse:
    c = config if isinstance(config, dict) else get_platform_snapshot()
    langs = ",".join(c.get("languages") or [])
    enabled_yes = " selected" if c.get("translation_enabled") else ""
    enabled_no = "" if c.get("translation_enabled") else " selected"
    history_ahnsen = " selected" if c.get("history_mode") == "ahnsen" else ""
    history_custom = "" if c.get("history_mode") == "ahnsen" else " selected"
    body = f"""
<section><span class="eyebrow">White-Label vollständig</span><h1>Plattform-Konfiguration</h1><p>Branding, Sprachen, Karte, Warngebiet, Absender, PWA-Metadaten und externe Quellen werden hier zentral pro Gemeinde gepflegt.</p></section>
<section class="admin-section"><form class="admin-form" method="post" action="/intern/plattform">
<h2>Identität & Erscheinungsbild</h2>
<div class="admin-grid"><label>Plattformname<input name="platform_name" value="{escape(c['platform_name'])}" required></label><label>Kurzname der PWA<input name="short_name" value="{escape(c['short_name'])}" maxlength="30"></label><label>Gemeinde / Ort<input name="municipality_name" value="{escape(c['municipality_name'])}" required></label><label>Postleitzahl<input name="postal_code" value="{escape(c['postal_code'])}"></label><label>Technischer Plattform-Slug<input name="platform_slug" value="{escape(c['platform_slug'])}" placeholder="meine-gemeinde"></label></div>
<label>Claim<input name="claim" value="{escape(c['claim'])}"></label><label>Beschreibung<textarea name="description">{escape(c['description'])}</textarea></label>
<div class="admin-grid"><label>Primärfarbe<input name="primary_color" value="{escape(c['primary_color'])}" placeholder="#174936"></label><label>Akzentfarbe<input name="accent_color" value="{escape(c['accent_color'])}" placeholder="#8da77a"></label><label>Logo-URL<input name="logo_url" value="{escape(c['logo_url'])}" placeholder="/assets/logo.png oder https://…"></label><label>Hero-Bild-URL<input name="hero_image_url" value="{escape(c['hero_image_url'])}"></label></div><div class="admin-grid"><label>PWA-Icon 192×192<input name="pwa_icon_192_url" value="{escape(c['pwa_icon_192_url'])}"></label><label>PWA-Icon 512×512<input name="pwa_icon_512_url" value="{escape(c['pwa_icon_512_url'])}"></label><label>Apple-Touch-Icon<input name="apple_touch_icon_url" value="{escape(c['apple_touch_icon_url'])}"></label></div>
<h2>Sprachen & kostenlose Übersetzung</h2>
<p>Die fünf Kernsprachen DE, EN, PL, UA und TR werden für die Bedienoberfläche lokal bereitgestellt. Wechselnde Inhalte ergänzt ein kostenloser Übersetzungsdienst; erfolgreiche Übersetzungen werden im Browser und in der Datenbank zwischengespeichert.</p>
<div class="admin-grid"><label>Standardsprache<input name="default_language" value="{escape(c['default_language'])}" maxlength="10"></label><label>Aktive Sprachen<input name="languages" value="{escape(langs)}" readonly><small>Fest eingerichtet: de,en,pl,uk,tr</small></label><label>Automatische Übersetzung<select name="translation_enabled"><option value="ja"{enabled_yes}>Aktiv</option><option value="nein"{enabled_no}>Deaktiviert</option></select></label><label>Zeitzone<input name="timezone" value="{escape(c['timezone'])}"></label></div>
<label>LibreTranslate API<input name="translation_api_url" value="{escape(c['translation_api_url'])}"></label><label>Kostenloser Fallback<input name="translation_fallback_url" value="{escape(c['translation_fallback_url'])}"></label><p><a class="admin-button secondary" href="/api/uebersetzen/status" target="_blank" rel="noopener">Übersetzungsdienst prüfen</a></p>
<h2>Karte & Vorgänge</h2><div class="admin-grid"><label>Karten-Breitengrad<input name="map_lat" value="{escape(str(c['map_lat']))}"></label><label>Karten-Längengrad<input name="map_lon" value="{escape(str(c['map_lon']))}"></label><label>Start-Zoom<input name="map_zoom" value="{escape(str(c['map_zoom']))}"></label><label>Ticket-Präfix<input name="ticket_prefix" value="{escape(c['ticket_prefix'])}" maxlength="8"></label></div>
<h2>Amtliche Warnungen</h2><label>Warngebiets-Begriffe<input name="warning_terms" value="{escape(c['warning_terms'])}"><small>Mit | trennen.</small></label><div class="admin-grid"><label>DWD-Ortsbegriff<input name="warning_location_name" value="{escape(c['warning_location_name'])}"></label><label>Gebietsbezeichnung<input name="warning_area_label" value="{escape(c['warning_area_label'])}"></label></div><label>BBK / MoWaS RSS-URL<input name="bbk_mowas_rss_url" value="{escape(c['bbk_mowas_rss_url'])}"></label><label>DWD CAP-Verzeichnis<input name="dwd_cap_index_url" value="{escape(c['dwd_cap_index_url'])}"></label>
<h2>Kontakt, Recht & externe Adresse</h2><div class="admin-grid"><label>Absender / verantwortliche Stelle<input name="contact_name" value="{escape(c['contact_name'])}"></label><label>E-Mail<input name="contact_email" value="{escape(c['contact_email'])}"></label><label>Telefon<input name="contact_phone" value="{escape(c['contact_phone'])}"></label><label>Öffentliche Basis-URL<input name="public_base_url" value="{escape(c['public_base_url'])}"></label></div><label>Anschrift<input name="contact_address" value="{escape(c['contact_address'])}"></label><div class="admin-grid"><label>Gemeinde-Webseite<input name="website_url" value="{escape(c['website_url'])}"></label><label>Datenschutz-URL<input name="privacy_url" value="{escape(c['privacy_url'])}"></label><label>Impressum-URL<input name="imprint_url" value="{escape(c['imprint_url'])}"></label></div>
<h2>Ortsgeschichte</h2><label>Modus<select name="history_mode"><option value="ahnsen"{history_ahnsen}>Ahnsen-Chronik verwenden</option><option value="custom"{history_custom}>Individuellen „Über den Ort“-Text verwenden</option></select></label>
<button class="admin-button" type="submit">White-Label-Konfiguration speichern</button></form></section>
"""
    return _page("Plattform-Konfiguration", "plattform", body)
