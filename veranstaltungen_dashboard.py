from datetime import datetime
from html import escape
import json

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from veranstaltungen_crud import get_alle_veranstaltungen, get_veranstaltung


def parse_datum(datum_text):
    try:
        return datetime.strptime(datum_text, "%d.%m.%Y").date()
    except Exception:
        return None


def _gallery_items(event):
    raw = getattr(event, "rueckblick_bilder_json", None)
    if not raw:
        return []
    try:
        daten = json.loads(raw)
    except Exception:
        return []
    if not isinstance(daten, list):
        return []
    result = []
    for item in daten:
        if not isinstance(item, dict):
            continue
        mime = str(item.get("mime") or "image/jpeg").lower()
        data = str(item.get("data") or "")
        if mime in {"image/jpeg", "image/png", "image/webp"} and data:
            result.append((mime, data))
    return result


def _event_image(event, large=False):
    if not event.bild_base64:
        klasse = "event-no-image large" if large else "event-no-image"
        return f'<span class="{klasse}">Kein Titelbild</span>'
    klasse = "event-image-large" if large else "event-image"
    return (
        f'<img class="{klasse}" src="data:image/jpeg;base64,{event.bild_base64}" '
        f'alt="Bild zu {escape(event.titel or "Veranstaltung")}">'
    )


def _gallery_preview(event):
    bilder = _gallery_items(event)
    if not bilder:
        return '<p class="event-gallery-empty">Noch keine Rückblick-Fotos gespeichert.</p>'
    thumbs = "".join(
        f'<img src="data:{escape(mime)};base64,{data}" alt="Rückblick-Foto" loading="lazy">'
        for mime, data in bilder
    )
    return f'<div class="event-gallery-preview">{thumbs}</div><small>{len(bilder)} Rückblick-Foto{"s" if len(bilder) != 1 else ""} gespeichert</small>'


def _status_badge(active):
    if active == "Ja":
        return '<span class="event-status active">Öffentlich</span>'
    return '<span class="event-status inactive">Ausgeblendet</span>'


def _event_actions(event):
    aktiv_neu = "Nein" if event.aktiv == "Ja" else "Ja"
    aktiv_button = "Deaktivieren" if event.aktiv == "Ja" else "Aktivieren"
    edit_url = f"/intern/veranstaltungen?bearbeiten_id={event.id}#veranstaltungsformular"
    return f'''<div class="event-actions">
        <a class="event-action secondary" href="{edit_url}">Bearbeiten</a>
        <a class="event-action" href="/veranstaltungen/aktiv/{event.id}/{aktiv_neu}">{aktiv_button}</a>
        <a class="event-action danger" href="/veranstaltungen/loeschen/{event.id}" onclick="return confirm('Veranstaltung wirklich löschen?')">Löschen</a>
    </div>'''


def _event_row(event, *, past=False):
    phase = '<span class="event-phase past">Vergangen</span>' if past else '<span class="event-phase upcoming">Kommend</span>'
    rueckblick = getattr(event, "rueckblick_text", "") or ""
    gallery_count = len(_gallery_items(event))
    archive_info = ""
    if past:
        archive_info = f'<small class="archive-info">Rückblick: {"vorhanden" if rueckblick else "noch leer"} · {gallery_count} Foto{"s" if gallery_count != 1 else ""}</small>'
    return f'''<tr>
        <td>{_event_image(event)}</td>
        <td><strong>{escape(event.titel or "Ohne Titel")}</strong><small class="event-category">{escape(getattr(event, "kategorie", "") or "Allgemein")}</small>{archive_info}</td>
        <td><strong>{escape(event.datum or "-")}</strong><small>{escape(event.uhrzeit or "Keine Uhrzeit")}</small></td>
        <td>{escape(event.ort or "-")}</td>
        <td>{phase}<br>{_status_badge(event.aktiv)}</td>
        <td>{_event_actions(event)}</td>
    </tr>'''


def _event_mobile_card(event, *, past=False):
    phase = '<span class="event-phase past">Vergangen</span>' if past else '<span class="event-phase upcoming">Kommend</span>'
    rueckblick = getattr(event, "rueckblick_text", "") or ""
    gallery_count = len(_gallery_items(event))
    archive = ""
    if past:
        archive = f'<div class="mobile-archive-state"><strong>Rückblick</strong><span>{"Text vorhanden" if rueckblick else "Noch kein Rückblicktext"} · {gallery_count} Foto{"s" if gallery_count != 1 else ""}</span></div>'
    return f'''<article class="event-mobile-card{" past" if past else ""}">
        {_event_image(event, large=True)}
        <div class="event-mobile-head">
            <div><small>{escape(getattr(event, "kategorie", "") or "Allgemein")}</small><h3>{escape(event.titel or "Ohne Titel")}</h3></div>
            {phase}
        </div>
        <dl>
            <div><dt>Datum</dt><dd>{escape(event.datum or "-")} · {escape(event.uhrzeit or "ohne Uhrzeit")}</dd></div>
            <div><dt>Ort</dt><dd>{escape(event.ort or "-")}</dd></div>
            <div><dt>Sichtbarkeit</dt><dd>{_status_badge(event.aktiv)}</dd></div>
        </dl>
        {archive}
        {_event_actions(event)}
    </article>'''


def _event_list_block(title, intro, events, *, past=False):
    if not events:
        empty_title = "Noch keine vergangenen Veranstaltungen" if past else "Noch keine kommenden Veranstaltungen"
        empty_text = "Abgelaufene Termine erscheinen hier automatisch." if past else "Lege einen Termin für die Bürger-PWA an."
        body = f'<div class="event-empty"><span>📅</span><h3>{empty_title}</h3><p>{empty_text}</p></div>'
    else:
        rows = "".join(_event_row(event, past=past) for event in events)
        cards = "".join(_event_mobile_card(event, past=past) for event in events)
        body = f'''<div class="event-table-wrap"><table><thead><tr><th>Bild</th><th>Veranstaltung</th><th>Termin</th><th>Ort</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>{rows}</tbody></table></div><div class="event-mobile-list">{cards}</div>'''
    return f'''<section class="event-list-section{" archive" if past else ""}"><div class="event-list-heading"><div><h2>{title}</h2><p class="event-card-intro">{intro}</p></div><span class="event-count">{len(events)} Einträge</span></div>{body}</section>'''


def veranstaltungen_dashboard(bearbeiten_id=None):
    heute = datetime.today().date()
    kommende = []
    vergangene = []
    for event in get_alle_veranstaltungen():
        datum = parse_datum(event.datum)
        if datum and datum < heute:
            vergangene.append(event)
        else:
            kommende.append(event)

    kommende.sort(key=lambda event: parse_datum(event.datum) or datetime.max.date())
    vergangene.sort(key=lambda event: parse_datum(event.datum) or datetime.min.date(), reverse=True)

    edit = get_veranstaltung(bearbeiten_id) if bearbeiten_id else None
    if edit:
        form_action = f"/veranstaltungen/bearbeiten/{edit.id}"
        form_title = "Veranstaltung bearbeiten"
        button_text = "Änderungen speichern"
        titel = edit.titel or ""
        datum = edit.datum or ""
        uhrzeit = edit.uhrzeit or ""
        ort = edit.ort or ""
        kategorie = getattr(edit, "kategorie", "") or ""
        ansprechpartner = edit.ansprechpartner or ""
        beschreibung = edit.beschreibung or ""
        rueckblick_text = getattr(edit, "rueckblick_text", "") or ""
        gallery_preview = _gallery_preview(edit)
        ist_vergangen = bool(parse_datum(edit.datum) and parse_datum(edit.datum) < heute)
        edit_note = '<div class="event-edit-note archive-note">Du bearbeitest eine vergangene Veranstaltung. Rückblick und Fotos werden im öffentlichen Archiv angezeigt.</div>' if ist_vergangen else ""
    else:
        form_action = "/veranstaltungen/neue"
        form_title = "Neue Veranstaltung"
        button_text = "Veranstaltung veröffentlichen"
        titel = datum = uhrzeit = ort = kategorie = ansprechpartner = beschreibung = rueckblick_text = ""
        gallery_preview = '<p class="event-gallery-empty">Rückblick-Fotos können auch später ergänzt werden.</p>'
        edit_note = ""

    upcoming_block = _event_list_block(
        "Kommende Termine",
        "Diese Termine werden bis einschließlich Veranstaltungstag oben in der Bürger-PWA angezeigt.",
        kommende,
    )
    past_block = _event_list_block(
        "Vergangene Veranstaltungen",
        "Sie bleiben gespeichert und öffentlich sichtbar, solange sie nicht manuell deaktiviert werden. Hier kannst du Rückblick und Fotos nachpflegen.",
        vergangene,
        past=True,
    )

    html = f'''
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>Veranstaltungen · Ahnsen hilft Verwaltung</title>
        <style>
            {intern_nav_css()}
            .event-layout {{ display:grid; grid-template-columns:minmax(330px,.72fr) minmax(0,1.28fr); gap:20px; align-items:start; }}
            .event-form-card {{ position:sticky; top:118px; }}
            .event-form-card h2,.event-list-card h2 {{ margin:0 0 8px; }}
            .event-card-intro {{ margin:0 0 18px; color:var(--admin-muted); line-height:1.5; }}
            .event-form {{ display:grid; gap:12px; }}
            .event-push-warning,.event-edit-note {{ display:grid; gap:4px; margin:0 0 13px; padding:12px 13px; border-radius:14px; font-size:12px; line-height:1.45; }}
            .event-push-warning {{ border:1px solid #efd99b; color:#79530e; background:#fff7dd; }}
            .event-edit-note.archive-note {{ border:1px solid #c8d8c5; color:#315b45; background:#eef6eb; font-weight:750; }}
            .event-form-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }}
            .event-field {{ display:grid; gap:6px; }}
            .event-field.full {{ grid-column:1 / -1; }}
            .event-field span {{ color:#465349; font-size:12px; font-weight:900; }}
            .event-form input,.event-form textarea {{ margin:0 !important; }}
            .event-form textarea {{ min-height:110px; }}
            .event-recap-panel {{ grid-column:1 / -1; margin-top:5px; padding:14px; border:1px solid #cfddca; border-radius:17px; background:#f5f9f2; }}
            .event-recap-panel h3 {{ margin:0 0 5px; color:var(--admin-forest); }}
            .event-recap-panel > p {{ margin:0 0 12px; color:var(--admin-muted); font-size:12px; line-height:1.5; }}
            .event-gallery-preview {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin:9px 0 7px; }}
            .event-gallery-preview img {{ width:100%; aspect-ratio:1.25; object-fit:cover; border-radius:10px; }}
            .event-gallery-empty {{ margin:8px 0; color:var(--admin-muted); font-size:12px; }}
            .event-gallery-remove {{ display:flex; align-items:flex-start; gap:8px; margin-top:9px; color:#5d665f; font-size:12px; }}
            .event-gallery-remove input {{ width:auto; margin-top:2px !important; }}
            .event-form-actions {{ display:flex; flex-wrap:wrap; gap:7px; margin-top:2px; }}
            .event-form-actions button,.event-form-actions a {{ margin:0 !important; }}
            .event-list-card {{ display:grid; gap:24px; }}
            .event-list-section.archive {{ padding-top:22px; border-top:1px solid var(--admin-line); }}
            .event-count {{ display:inline-flex; min-height:32px; align-items:center; padding:6px 10px; border-radius:999px; color:var(--admin-forest); background:var(--admin-sage-soft); font-size:12px; font-weight:900; }}
            .event-list-heading {{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }}
            .event-table-wrap {{ overflow:auto; border:1px solid var(--admin-line); border-radius:19px; }}
            .event-table-wrap table {{ min-width:880px; }}
            .event-image {{ width:88px; height:66px; display:block; object-fit:cover; border-radius:14px; }}
            .event-image-large {{ width:100%; height:190px; display:block; object-fit:cover; border-radius:18px; }}
            .event-no-image {{ width:88px; min-height:66px; display:grid; place-items:center; border-radius:14px; color:var(--admin-muted); background:#eef2eb; font-size:11px; font-weight:800; text-align:center; }}
            .event-no-image.large {{ width:100%; min-height:150px; }}
            td small {{ display:block; margin-top:5px; color:var(--admin-muted); }}
            .event-category {{ color:var(--admin-green); font-weight:850; }}
            .archive-info {{ max-width:230px; }}
            .event-status,.event-phase {{ display:inline-flex; min-height:28px; align-items:center; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:900; }}
            .event-status.active {{ color:#1d603f; background:#dff1e5; }}
            .event-status.inactive {{ color:#687169; background:#edf0ec; }}
            .event-phase.upcoming {{ color:#245d47; background:#e7f2e8; margin-bottom:5px; }}
            .event-phase.past {{ color:#6c6253; background:#f0ece5; margin-bottom:5px; }}
            .event-actions {{ display:flex; flex-wrap:wrap; gap:6px; }}
            .event-action {{ min-height:37px; display:inline-flex; align-items:center; justify-content:center; padding:8px 10px; border-radius:11px; color:white; background:var(--admin-green); font-size:11px; font-weight:850; text-decoration:none; }}
            .event-action.secondary {{ color:var(--admin-forest) !important; border:1px solid var(--admin-line); background:#f5f8f2 !important; }}
            .event-action.danger {{ background:var(--admin-danger) !important; }}
            .event-mobile-list {{ display:none; }}
            .event-mobile-card {{ padding:16px; border:1px solid var(--admin-line); border-radius:22px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .event-mobile-card.past {{ background:#fbfaf7; }}
            .event-mobile-card + .event-mobile-card {{ margin-top:12px; }}
            .event-mobile-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-top:14px; }}
            .event-mobile-head small {{ color:var(--admin-green); font-size:11px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }}
            .event-mobile-head h3 {{ margin:4px 0 0; font-size:22px; }}
            .event-mobile-card dl {{ display:grid; gap:9px; margin:15px 0; }}
            .event-mobile-card dl div {{ display:grid; grid-template-columns:105px 1fr; gap:10px; }}
            .event-mobile-card dt {{ color:var(--admin-muted); font-size:11px; font-weight:900; text-transform:uppercase; }}
            .event-mobile-card dd {{ margin:0; }}
            .mobile-archive-state {{ display:grid; gap:3px; margin:0 0 14px; padding:10px 12px; border-radius:12px; background:#f0f4ed; font-size:12px; }}
            .event-empty {{ padding:32px 20px; border:1px dashed #b9cbb4; border-radius:20px; background:#f7faf4; text-align:center; }}
            .event-empty > span {{ font-size:34px; }}
            .event-empty h3 {{ margin:10px 0 5px; }}
            .event-empty p {{ margin:0; color:var(--admin-muted); }}
            @media (max-width:1080px) {{ .event-layout {{ grid-template-columns:1fr; }} .event-form-card {{ position:static; }} }}
            @media (max-width:820px) {{ .event-table-wrap {{ display:none; }} .event-mobile-list {{ display:block; }} }}
            @media (max-width:560px) {{ .event-form-grid {{ grid-template-columns:1fr; }} .event-field.full,.event-recap-panel {{ grid-column:auto; }} .event-form-actions {{ display:grid; }} .event-mobile-card dl div {{ grid-template-columns:1fr; gap:3px; }} .event-gallery-preview {{ grid-template-columns:repeat(3,minmax(0,1fr)); }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("veranstaltungen")}
            <section class="admin-hero">
                <span class="admin-eyebrow">Dorfleben organisieren</span>
                <h1>Veranstaltungen</h1>
                <p>Kommende Termine veröffentlichen und vergangene Veranstaltungen als Rückblick mit Text und Fotos weiterpflegen.</p>
                <div class="admin-hero-actions"><a href="/veranstaltungen" target="_blank" rel="noopener">Öffentliche Termine ansehen</a></div>
            </section>
            <div class="event-layout">
                <section class="box event-form-card" id="veranstaltungsformular">
                    <h2>{form_title}</h2>
                    <p class="event-card-intro">Alle Angaben können später jederzeit angepasst werden.</p>
                    {edit_note}
                    <div class="event-push-warning"><strong>🔔 Push-Hinweis</strong><span>Neue und kommende Veranstaltungen können beim Speichern eine Push-Nachricht auslösen. Änderungen an bereits vergangenen Veranstaltungen werden ohne Push gespeichert.</span></div>
                    <form class="event-form" method="post" action="{form_action}" enctype="multipart/form-data" onsubmit="return confirm('Veranstaltung speichern?')">
                        <div class="event-form-grid">
                            <label class="event-field full"><span>Titel *</span><input name="titel" value="{escape(titel)}" required placeholder="z. B. Sommerfest der Feuerwehr"></label>
                            <label class="event-field"><span>Datum</span><input name="datum" value="{escape(datum)}" placeholder="12.07.2026"></label>
                            <label class="event-field"><span>Uhrzeit</span><input name="uhrzeit" value="{escape(uhrzeit)}" placeholder="18:00 Uhr"></label>
                            <label class="event-field"><span>Ort</span><input name="ort" value="{escape(ort)}" placeholder="Dorfgemeinschaftshaus"></label>
                            <label class="event-field"><span>Kategorie</span><input name="kategorie" value="{escape(kategorie)}" placeholder="Gemeinde, Verein, Feuerwehr …"></label>
                            <label class="event-field full"><span>Ansprechpartner</span><input name="ansprechpartner" value="{escape(ansprechpartner)}" placeholder="Name oder Kontakt"></label>
                            <label class="event-field full"><span>Titelbild</span><input type="file" name="bild" accept="image/jpeg,image/png,image/webp"><small>Das bisherige Titelbild bleibt erhalten, wenn du kein neues auswählst.</small></label>
                            <label class="event-field full"><span>Beschreibung der Veranstaltung</span><textarea name="beschreibung" placeholder="Was erwartet die Besucher?">{escape(beschreibung)}</textarea></label>
                            <section class="event-recap-panel">
                                <h3>Rückblick nach der Veranstaltung</h3>
                                <p>Optional. Dieser Bereich erscheint bei vergangenen Veranstaltungen im öffentlichen Archiv.</p>
                                <label class="event-field full"><span>Kurzer Rückblick</span><textarea name="rueckblick_text" maxlength="2500" placeholder="z. B. Das Sommerfest war sehr gut besucht. Vielen Dank an alle Helferinnen und Helfer …">{escape(rueckblick_text)}</textarea></label>
                                <label class="event-field full"><span>Rückblick-Fotos hinzufügen</span><input type="file" name="rueckblick_bilder" accept="image/jpeg,image/png,image/webp" multiple><small>Mehrere Fotos möglich · JPG, PNG oder WEBP · maximal 6 MB pro Foto · bis zu 12 Fotos pro Veranstaltung.</small></label>
                                {gallery_preview}
                                <label class="event-gallery-remove"><input type="checkbox" name="rueckblick_bilder_loeschen" value="ja"><span>Alle bereits gespeicherten Rückblick-Fotos entfernen</span></label>
                            </section>
                        </div>
                        <div class="event-form-actions"><button type="submit">{button_text}</button><a class="cancel" href="/intern/veranstaltungen">Formular leeren</a></div>
                    </form>
                </section>
                <section class="box event-list-card">
                    {upcoming_block}
                    {past_block}
                </section>
            </div>
        </main>
    </body>
    </html>
    '''
    return HTMLResponse(html)
