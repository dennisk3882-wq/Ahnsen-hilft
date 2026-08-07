from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from veranstaltungen_crud import get_alle_veranstaltungen, get_veranstaltung


def parse_datum(datum_text):
    try:
        return datetime.strptime(datum_text, "%d.%m.%Y").date()
    except Exception:
        return None


def _event_image(event, large=False):
    if not event.bild_base64:
        return '<span class="event-no-image">Kein Bild</span>'
    klasse = "event-image-large" if large else "event-image"
    return (
        f'<img class="{klasse}" src="data:image/jpeg;base64,{event.bild_base64}" '
        f'alt="Bild zu {escape(event.titel or "Veranstaltung")}">'
    )


def _status_badge(active):
    if active == "Ja":
        return '<span class="event-status active">Aktiv</span>'
    return '<span class="event-status inactive">Inaktiv</span>'


def veranstaltungen_dashboard(bearbeiten_id=None):
    heute = datetime.today().date()
    veranstaltungen = []
    for event in get_alle_veranstaltungen():
        datum = parse_datum(event.datum)
        if datum and datum < heute:
            continue
        veranstaltungen.append(event)
    veranstaltungen.sort(key=lambda event: parse_datum(event.datum) or datetime.max.date())

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
    else:
        form_action = "/veranstaltungen/neue"
        form_title = "Neue Veranstaltung"
        button_text = "Veranstaltung veröffentlichen"
        titel = datum = uhrzeit = ort = kategorie = ansprechpartner = beschreibung = ""

    rows = []
    cards = []
    for event in veranstaltungen:
        aktiv_neu = "Nein" if event.aktiv == "Ja" else "Ja"
        aktiv_button = "Deaktivieren" if event.aktiv == "Ja" else "Aktivieren"
        edit_url = f"/intern/veranstaltungen?bearbeiten_id={event.id}#veranstaltungsformular"

        rows.append(
            f"""
            <tr>
                <td>{_event_image(event)}</td>
                <td><strong>{escape(event.titel or "Ohne Titel")}</strong><small class="event-category">{escape(getattr(event, 'kategorie', '') or 'Allgemein')}</small></td>
                <td><strong>{escape(event.datum or "-")}</strong><small>{escape(event.uhrzeit or "Keine Uhrzeit")}</small></td>
                <td>{escape(event.ort or "-")}</td>
                <td>{escape(event.ansprechpartner or "-")}</td>
                <td>{_status_badge(event.aktiv)}</td>
                <td>
                    <div class="event-actions">
                        <a class="event-action secondary" href="{edit_url}">Bearbeiten</a>
                        <a class="event-action" href="/veranstaltungen/aktiv/{event.id}/{aktiv_neu}">{aktiv_button}</a>
                        <a class="event-action danger" href="/veranstaltungen/loeschen/{event.id}" onclick="return confirm('Veranstaltung wirklich löschen?')">Löschen</a>
                    </div>
                </td>
            </tr>
            """
        )

        cards.append(
            f"""
            <article class="event-mobile-card">
                {_event_image(event, large=True)}
                <div class="event-mobile-head">
                    <div><small>{escape(getattr(event, 'kategorie', '') or 'Allgemein')}</small><h3>{escape(event.titel or 'Ohne Titel')}</h3></div>
                    {_status_badge(event.aktiv)}
                </div>
                <dl>
                    <div><dt>Datum</dt><dd>{escape(event.datum or '-')} · {escape(event.uhrzeit or 'ohne Uhrzeit')}</dd></div>
                    <div><dt>Ort</dt><dd>{escape(event.ort or '-')}</dd></div>
                    <div><dt>Ansprechpartner</dt><dd>{escape(event.ansprechpartner or '-')}</dd></div>
                </dl>
                <div class="event-actions">
                    <a class="event-action secondary" href="{edit_url}">Bearbeiten</a>
                    <a class="event-action" href="/veranstaltungen/aktiv/{event.id}/{aktiv_neu}">{aktiv_button}</a>
                    <a class="event-action danger" href="/veranstaltungen/loeschen/{event.id}" onclick="return confirm('Veranstaltung wirklich löschen?')">Löschen</a>
                </div>
            </article>
            """
        )

    empty = "" if veranstaltungen else """
        <div class="event-empty">
            <span>📅</span>
            <h3>Noch keine kommenden Veranstaltungen</h3>
            <p>Lege oben den ersten Termin für die Bürger-PWA an.</p>
        </div>
    """

    html = f"""
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
            .event-push-warning {{ display:grid; gap:4px; margin:0 0 13px; padding:12px 13px; border:1px solid #efd99b; border-radius:14px; color:#79530e; background:#fff7dd; font-size:12px; line-height:1.45; }}
            .event-form-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }}
            .event-field {{ display:grid; gap:6px; }}
            .event-field.full {{ grid-column:1 / -1; }}
            .event-field span {{ color:#465349; font-size:12px; font-weight:900; }}
            .event-form input,.event-form textarea {{ margin:0 !important; }}
            .event-form-actions {{ display:flex; flex-wrap:wrap; gap:7px; margin-top:2px; }}
            .event-form-actions button,.event-form-actions a {{ margin:0 !important; }}

            .event-count {{ display:inline-flex; min-height:32px; align-items:center; padding:6px 10px; border-radius:999px; color:var(--admin-forest); background:var(--admin-sage-soft); font-size:12px; font-weight:900; }}
            .event-list-heading {{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }}
            .event-table-wrap {{ overflow:auto; border:1px solid var(--admin-line); border-radius:19px; }}
            .event-table-wrap table {{ min-width:930px; }}
            .event-image {{ width:88px; height:66px; display:block; object-fit:cover; border-radius:14px; }}
            .event-image-large {{ width:100%; height:190px; display:block; object-fit:cover; border-radius:18px; }}
            .event-no-image {{ width:88px; min-height:66px; display:grid; place-items:center; border-radius:14px; color:var(--admin-muted); background:#eef2eb; font-size:11px; font-weight:800; text-align:center; }}
            td small {{ display:block; margin-top:5px; color:var(--admin-muted); }}
            .event-category {{ color:var(--admin-green); font-weight:850; }}
            .event-status {{ display:inline-flex; min-height:30px; align-items:center; padding:5px 10px; border-radius:999px; font-size:12px; font-weight:900; }}
            .event-status.active {{ color:#1d603f; background:#dff1e5; }}
            .event-status.inactive {{ color:#687169; background:#edf0ec; }}
            .event-actions {{ display:flex; flex-wrap:wrap; gap:6px; }}
            .event-action {{ min-height:37px; display:inline-flex; align-items:center; justify-content:center; padding:8px 10px; border-radius:11px; color:white; background:var(--admin-green); font-size:11px; font-weight:850; text-decoration:none; }}
            .event-action.secondary {{ color:var(--admin-forest) !important; border:1px solid var(--admin-line); background:#f5f8f2 !important; }}
            .event-action.danger {{ background:var(--admin-danger) !important; }}
            .event-mobile-list {{ display:none; }}
            .event-mobile-card {{ padding:16px; border:1px solid var(--admin-line); border-radius:22px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .event-mobile-card + .event-mobile-card {{ margin-top:12px; }}
            .event-mobile-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-top:14px; }}
            .event-mobile-head small {{ color:var(--admin-green); font-size:11px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }}
            .event-mobile-head h3 {{ margin:4px 0 0; font-size:22px; }}
            .event-mobile-card dl {{ display:grid; gap:9px; margin:15px 0; }}
            .event-mobile-card dl div {{ display:grid; grid-template-columns:105px 1fr; gap:10px; }}
            .event-mobile-card dt {{ color:var(--admin-muted); font-size:11px; font-weight:900; text-transform:uppercase; }}
            .event-mobile-card dd {{ margin:0; }}
            .event-empty {{ padding:38px 20px; border:1px dashed #b9cbb4; border-radius:20px; background:#f7faf4; text-align:center; }}
            .event-empty > span {{ font-size:34px; }}
            .event-empty h3 {{ margin:10px 0 5px; }}
            .event-empty p {{ margin:0; color:var(--admin-muted); }}

            @media (max-width:1080px) {{ .event-layout {{ grid-template-columns:1fr; }} .event-form-card {{ position:static; }} }}
            @media (max-width:820px) {{ .event-table-wrap {{ display:none; }} .event-mobile-list {{ display:block; }} }}
            @media (max-width:560px) {{ .event-form-grid {{ grid-template-columns:1fr; }} .event-field.full {{ grid-column:auto; }} .event-form-actions {{ display:grid; }} .event-mobile-card dl div {{ grid-template-columns:1fr; gap:3px; }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("veranstaltungen")}

            <section class="admin-hero">
                <span class="admin-eyebrow">Dorfleben organisieren</span>
                <h1>Veranstaltungen</h1>
                <p>Termine für die Bürger-PWA erstellen, bearbeiten, veröffentlichen und übersichtlich verwalten.</p>
                <div class="admin-hero-actions"><a href="/veranstaltungen" target="_blank" rel="noopener">Öffentliche Termine ansehen</a></div>
            </section>

            <div class="event-layout">
                <section class="box event-form-card" id="veranstaltungsformular">
                    <h2>{form_title}</h2>
                    <p class="event-card-intro">Alle Angaben können später jederzeit angepasst werden.</p>
                    <div class="event-push-warning"><strong>🔔 Push-Hinweis</strong><span>Beim Öffnen von „Bearbeiten“ wird noch nichts versendet. Erst beim Speichern erhalten Nutzer mit aktivierter Veranstaltungs-Kategorie eine Push-Nachricht.</span></div>
                    <form class="event-form" method="post" action="{form_action}" enctype="multipart/form-data" onsubmit="return confirm('Veranstaltung speichern? Nutzer mit aktivierter Kategorie Veranstaltungen erhalten anschließend eine Push-Nachricht.')">
                        <div class="event-form-grid">
                            <label class="event-field full"><span>Titel *</span><input name="titel" value="{escape(titel)}" required placeholder="z. B. Sommerfest der Feuerwehr"></label>
                            <label class="event-field"><span>Datum</span><input name="datum" value="{escape(datum)}" placeholder="12.07.2026"></label>
                            <label class="event-field"><span>Uhrzeit</span><input name="uhrzeit" value="{escape(uhrzeit)}" placeholder="18:00 Uhr"></label>
                            <label class="event-field"><span>Ort</span><input name="ort" value="{escape(ort)}" placeholder="Dorfgemeinschaftshaus"></label>
                            <label class="event-field"><span>Kategorie</span><input name="kategorie" value="{escape(kategorie)}" placeholder="Gemeinde, Verein, Feuerwehr …"></label>
                            <label class="event-field full"><span>Ansprechpartner</span><input name="ansprechpartner" value="{escape(ansprechpartner)}" placeholder="Name oder Kontakt"></label>
                            <label class="event-field full"><span>Bild</span><input type="file" name="bild" accept="image/*"></label>
                            <label class="event-field full"><span>Beschreibung</span><textarea name="beschreibung" placeholder="Was erwartet die Besucher?">{escape(beschreibung)}</textarea></label>
                        </div>
                        <div class="event-form-actions"><button type="submit">{button_text}</button><a class="cancel" href="/intern/veranstaltungen">Formular leeren</a></div>
                    </form>
                </section>

                <section class="box event-list-card">
                    <div class="event-list-heading"><div><h2>Kommende Termine</h2><p class="event-card-intro">Vergangene Veranstaltungen werden automatisch ausgeblendet.</p></div><span class="event-count">{len(veranstaltungen)} Einträge</span></div>
                    {empty}
                    <div class="event-table-wrap" {"hidden" if not veranstaltungen else ""}>
                        <table><thead><tr><th>Bild</th><th>Veranstaltung</th><th>Termin</th><th>Ort</th><th>Kontakt</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
                    </div>
                    <div class="event-mobile-list">{''.join(cards)}</div>
                </section>
            </div>
        </main>
    </body>
    </html>
    """
    return HTMLResponse(html)
