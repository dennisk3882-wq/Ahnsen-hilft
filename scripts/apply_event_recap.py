from pathlib import Path

MODELS = r'''from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

from database import Base


class Veranstaltung(Base):
    __tablename__ = "veranstaltungen"

    id = Column(Integer, primary_key=True, index=True)

    titel = Column(String, nullable=False)
    datum = Column(String)
    uhrzeit = Column(String)
    ort = Column(String)
    kategorie = Column(String)
    beschreibung = Column(Text)
    ansprechpartner = Column(String)

    bild_base64 = Column(Text, nullable=True)
    rueckblick_text = Column(Text, nullable=True)
    rueckblick_bilder_json = Column(Text, nullable=True)

    aktiv = Column(String, default="Ja")
    erstellt_am = Column(DateTime, default=datetime.utcnow)
'''

CRUD = r'''import base64
import json

from database import Base, engine, SessionLocal
from veranstaltungen_models import Veranstaltung
from sqlalchemy import inspect


MAX_RUECKBLICK_BILDER = 12


def init_veranstaltungen_db():
    Base.metadata.create_all(bind=engine)

    vorhandene_spalten = {
        spalte["name"]
        for spalte in inspect(engine).get_columns("veranstaltungen")
    }

    neue_spalten = {
        "kategorie": "VARCHAR",
        "rueckblick_text": "TEXT",
        "rueckblick_bilder_json": "TEXT",
    }
    for spaltenname, sql_typ in neue_spalten.items():
        if spaltenname in vorhandene_spalten:
            continue
        with engine.begin() as conn:
            conn.exec_driver_sql(
                f"ALTER TABLE veranstaltungen ADD COLUMN {spaltenname} {sql_typ}"
            )
        print(f"Spalte veranstaltungen.{spaltenname} hinzugefügt.")


def _gallery_laden(raw):
    if not raw:
        return []
    try:
        daten = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(daten, list):
        return []
    result = []
    for eintrag in daten:
        if not isinstance(eintrag, dict):
            continue
        mime = str(eintrag.get("mime") or "image/jpeg").strip().lower()
        data = str(eintrag.get("data") or "").strip()
        if mime not in {"image/jpeg", "image/png", "image/webp"} or not data:
            continue
        result.append({"mime": mime, "data": data})
    return result[:MAX_RUECKBLICK_BILDER]


def _gallery_neue_eintraege(bilder):
    result = []
    for eintrag in bilder or []:
        try:
            mime, bild_bytes = eintrag
        except (TypeError, ValueError):
            continue
        mime = str(mime or "image/jpeg").strip().lower()
        if mime not in {"image/jpeg", "image/png", "image/webp"} or not bild_bytes:
            continue
        result.append(
            {
                "mime": mime,
                "data": base64.b64encode(bild_bytes).decode("utf-8"),
            }
        )
    return result


def save_veranstaltung(
    titel,
    datum,
    uhrzeit,
    ort,
    kategorie,
    beschreibung,
    ansprechpartner,
    bild_bytes=None,
    rueckblick_text="",
    rueckblick_bilder=None,
):
    db = SessionLocal()

    try:
        bild_base64 = None

        if bild_bytes:
            bild_base64 = base64.b64encode(bild_bytes).decode("utf-8")

        gallery = _gallery_neue_eintraege(rueckblick_bilder)[:MAX_RUECKBLICK_BILDER]
        veranstaltung = Veranstaltung(
            titel=titel,
            datum=datum,
            uhrzeit=uhrzeit,
            ort=ort,
            kategorie=kategorie,
            beschreibung=beschreibung,
            ansprechpartner=ansprechpartner,
            bild_base64=bild_base64,
            rueckblick_text=rueckblick_text or "",
            rueckblick_bilder_json=json.dumps(gallery) if gallery else None,
            aktiv="Ja",
        )

        db.add(veranstaltung)
        db.commit()
        db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def get_aktive_veranstaltungen():
    from datetime import datetime

    db = SessionLocal()

    try:
        alle = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )

        heute = datetime.now().date()
        kommende = []

        for v in alle:
            try:
                datum = datetime.strptime(v.datum, "%d.%m.%Y").date()
                if datum >= heute:
                    kommende.append(v)
            except Exception:
                kommende.append(v)

        def sortierschluessel(veranstaltung):
            try:
                return datetime.strptime(veranstaltung.datum, "%d.%m.%Y")
            except (TypeError, ValueError):
                return datetime.max

        kommende.sort(key=sortierschluessel)

        return kommende

    finally:
        db.close()


def get_vergangene_veranstaltungen():
    from datetime import datetime

    db = SessionLocal()

    try:
        alle = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )

        heute = datetime.now().date()
        vergangene = []

        for v in alle:
            try:
                datum = datetime.strptime(v.datum, "%d.%m.%Y").date()
            except (TypeError, ValueError):
                continue
            if datum < heute:
                vergangene.append(v)

        def sortierschluessel(veranstaltung):
            try:
                return datetime.strptime(veranstaltung.datum, "%d.%m.%Y")
            except (TypeError, ValueError):
                return datetime.min

        vergangene.sort(key=sortierschluessel, reverse=True)
        return vergangene

    finally:
        db.close()


def get_alle_veranstaltungen():
    db = SessionLocal()

    try:
        return db.query(Veranstaltung).all()

    finally:
        db.close()


def get_veranstaltung(veranstaltung_id):
    db = SessionLocal()

    try:
        return (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

    finally:
        db.close()


def update_veranstaltung(
    veranstaltung_id,
    titel,
    datum,
    uhrzeit,
    ort,
    kategorie,
    beschreibung,
    ansprechpartner,
    bild_bytes=None,
    rueckblick_text="",
    rueckblick_bilder=None,
    rueckblick_bilder_loeschen=False,
):
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            veranstaltung.titel = titel
            veranstaltung.datum = datum
            veranstaltung.uhrzeit = uhrzeit
            veranstaltung.ort = ort
            veranstaltung.kategorie = kategorie
            veranstaltung.beschreibung = beschreibung
            veranstaltung.ansprechpartner = ansprechpartner
            veranstaltung.rueckblick_text = rueckblick_text or ""

            if bild_bytes:
                veranstaltung.bild_base64 = base64.b64encode(
                    bild_bytes
                ).decode("utf-8")

            gallery = [] if rueckblick_bilder_loeschen else _gallery_laden(
                getattr(veranstaltung, "rueckblick_bilder_json", None)
            )
            gallery.extend(_gallery_neue_eintraege(rueckblick_bilder))
            gallery = gallery[-MAX_RUECKBLICK_BILDER:]
            veranstaltung.rueckblick_bilder_json = (
                json.dumps(gallery) if gallery else None
            )

            db.commit()
            db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def set_veranstaltung_aktiv(veranstaltung_id, aktiv):
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            veranstaltung.aktiv = aktiv
            db.commit()
            db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def delete_veranstaltung(veranstaltung_id):
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            db.delete(veranstaltung)
            db.commit()

        return veranstaltung

    finally:
        db.close()
'''

DASHBOARD = r'''from datetime import datetime
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
    """
    return HTMLResponse(html)
'''

Path('veranstaltungen_models.py').write_text(MODELS, encoding='utf-8')
Path('veranstaltungen_crud.py').write_text(CRUD, encoding='utf-8')
Path('veranstaltungen_dashboard.py').write_text(DASHBOARD, encoding='utf-8')

# Extend admin handlers with recap text and multiple recap images.
path = Path('main.py')
text = path.read_text(encoding='utf-8')
helper_marker = '''def _enthaelt_suchtext(werte, suchtext):\n    suchtext = suchtext.casefold()\n    return any(\n        suchtext in str(wert or "").casefold()\n        for wert in werte\n    )\n\n\n'''
helper = helper_marker + '''MAX_EVENT_RECAP_IMAGE_BYTES = 6 * 1024 * 1024\nMAX_EVENT_RECAP_IMAGES_PER_UPLOAD = 12\nEVENT_RECAP_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}\n\n\nasync def _read_event_recap_images(files):\n    result = []\n    for upload in files or []:\n        if not upload or not getattr(upload, "filename", ""):\n            continue\n        content_type = str(getattr(upload, "content_type", "") or "").lower()\n        if content_type not in EVENT_RECAP_IMAGE_TYPES:\n            raise HTTPException(status_code=400, detail="Rückblick-Fotos müssen JPG, PNG oder WEBP sein")\n        data = await upload.read()\n        if not data:\n            continue\n        if len(data) > MAX_EVENT_RECAP_IMAGE_BYTES:\n            raise HTTPException(status_code=400, detail="Ein Rückblick-Foto ist größer als 6 MB")\n        result.append((content_type, data))\n        if len(result) > MAX_EVENT_RECAP_IMAGES_PER_UPLOAD:\n            raise HTTPException(status_code=400, detail="Maximal 12 Rückblick-Fotos pro Upload")\n    return result\n\n\ndef _veranstaltung_ist_kommend(event):\n    try:\n        return datetime.strptime(event.datum, "%d.%m.%Y").date() >= datetime.today().date()\n    except (TypeError, ValueError):\n        return True\n\n\n'''
if 'async def _read_event_recap_images' not in text:
    if helper_marker not in text:
        raise SystemExit('main helper marker missing')
    text = text.replace(helper_marker, helper, 1)

old_new_params = '''    ansprechpartner: str = Form(""),\n    beschreibung: str = Form(""),\n    bild: UploadFile | None = File(None),\n    _=Depends(check_dashboard_login),\n):\n    bild_bytes = None\n\n    if bild:\n        bild_bytes = await bild.read()\n\n    event = save_veranstaltung('''
new_new_params = '''    ansprechpartner: str = Form(""),\n    beschreibung: str = Form(""),\n    rueckblick_text: str = Form(""),\n    bild: UploadFile | None = File(None),\n    rueckblick_bilder: list[UploadFile] | None = File(None),\n    _=Depends(check_dashboard_login),\n):\n    bild_bytes = None\n\n    if bild:\n        bild_bytes = await bild.read()\n    recap_images = await _read_event_recap_images(rueckblick_bilder)\n\n    event = save_veranstaltung('''
if old_new_params in text:
    text = text.replace(old_new_params, new_new_params, 1)

old_save_tail = '''        ansprechpartner=ansprechpartner,\n        bild_bytes=bild_bytes,\n    )\n    if event and event.aktiv == "Ja":'''
new_save_tail = '''        ansprechpartner=ansprechpartner,\n        bild_bytes=bild_bytes,\n        rueckblick_text=rueckblick_text,\n        rueckblick_bilder=recap_images,\n    )\n    if event and event.aktiv == "Ja" and _veranstaltung_ist_kommend(event):'''
if old_save_tail in text:
    text = text.replace(old_save_tail, new_save_tail, 1)

old_edit_params = '''    ansprechpartner: str = Form(""),\n    beschreibung: str = Form(""),\n    bild: UploadFile | None = File(None),\n    _=Depends(check_dashboard_login),\n):\n    bild_bytes = None\n\n    if bild and bild.filename:\n        bild_bytes = await bild.read()\n\n    event = update_veranstaltung('''
new_edit_params = '''    ansprechpartner: str = Form(""),\n    beschreibung: str = Form(""),\n    rueckblick_text: str = Form(""),\n    rueckblick_bilder_loeschen: str = Form(""),\n    bild: UploadFile | None = File(None),\n    rueckblick_bilder: list[UploadFile] | None = File(None),\n    _=Depends(check_dashboard_login),\n):\n    bild_bytes = None\n\n    if bild and bild.filename:\n        bild_bytes = await bild.read()\n    recap_images = await _read_event_recap_images(rueckblick_bilder)\n\n    event = update_veranstaltung('''
if old_edit_params in text:
    text = text.replace(old_edit_params, new_edit_params, 1)

old_update_tail = '''        ansprechpartner=ansprechpartner,\n        bild_bytes=bild_bytes,\n    )\n    if event and event.aktiv == "Ja":'''
new_update_tail = '''        ansprechpartner=ansprechpartner,\n        bild_bytes=bild_bytes,\n        rueckblick_text=rueckblick_text,\n        rueckblick_bilder=recap_images,\n        rueckblick_bilder_loeschen=rueckblick_bilder_loeschen == "ja",\n    )\n    if event and event.aktiv == "Ja" and _veranstaltung_ist_kommend(event):'''
if old_update_tail in text:
    text = text.replace(old_update_tail, new_update_tail, 1)

required_main = [
    'async def _read_event_recap_images',
    'rueckblick_bilder: list[UploadFile] | None = File(None)',
    'rueckblick_bilder_loeschen=rueckblick_bilder_loeschen == "ja"',
    'and _veranstaltung_ist_kommend(event)',
]
for needle in required_main:
    if needle not in text:
        raise SystemExit(f'main patch missing: {needle}')
path.write_text(text, encoding='utf-8')

# Public PWA: tile wording + recap/gallery in archive.
path = Path('pwa_ui.py')
text = path.read_text(encoding='utf-8')
if 'import json\n' not in text:
    text = text.replace('from __future__ import annotations\n\n', 'from __future__ import annotations\n\nimport json\n', 1)
text = text.replace('("calendar", "Veranstaltungen", "Was ist los in Ahnsen?", "/veranstaltungen")', '("calendar", "Veranstaltungen", "Aktuelle und vergangene Veranstaltungen.", "/veranstaltungen")', 1)
start = text.index('def events_page(')
end = text.index('\n\ndef dgh_page', start)
new_events = r'''def events_page(events: Iterable, past_events: Iterable = ()) -> HTMLResponse:
    def gallery_items(event) -> list[tuple[str, str]]:
        raw = getattr(event, "rueckblick_bilder_json", None)
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        result = []
        for item in data:
            if not isinstance(item, dict):
                continue
            mime = str(item.get("mime") or "image/jpeg").lower()
            encoded = str(item.get("data") or "")
            if mime in {"image/jpeg", "image/png", "image/webp"} and encoded:
                result.append((mime, encoded))
        return result[:12]

    def event_card(event, *, past: bool = False) -> str:
        image = f'<img class="event-image" src="data:image/jpeg;base64,{event.bild_base64}" alt="">' if getattr(event, "bild_base64", None) else ""
        past_label = ' <span class="past-event-label">Vergangen</span>' if past else ""
        card_class = "event-card past-event" if past else "event-card"
        time_meta = f'<span>🕒 {escape(event.uhrzeit)}</span>' if getattr(event, "uhrzeit", "") else ""
        place_meta = f'<span>📍 {escape(event.ort)}</span>' if getattr(event, "ort", "") else ""
        recap_html = ""
        if past:
            recap = str(getattr(event, "rueckblick_text", "") or "").strip()
            gallery = gallery_items(event)
            recap_copy = f'<p>{escape(recap).replace(chr(10), "<br>")}</p>' if recap else ""
            gallery_html = ""
            if gallery:
                images = "".join(
                    f'<img src="data:{escape(mime)};base64,{encoded}" alt="Impression der Veranstaltung" loading="lazy">'
                    for mime, encoded in gallery
                )
                gallery_html = f'<div class="past-event-gallery">{images}</div>'
            if recap or gallery:
                heading = "Rückblick" if recap else "Impressionen"
                recap_html = f'<section class="event-recap"><strong>{heading}</strong>{recap_copy}{gallery_html}</section>'
        return f'<article class="{card_class}">{image}<div class="event-body"><span class="event-date">{escape(getattr(event, "datum", "") or "Termin")}{past_label}</span><h2>{escape(getattr(event, "titel", "") or "Veranstaltung")}</h2><p>{escape(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.")}</p><div class="meta-row">{time_meta}{place_meta}</div>{recap_html}</div></article>'

    upcoming = [event_card(event) for event in events]
    if not upcoming:
        upcoming.append('<section class="empty-state"><span>📅</span><h2>Keine kommenden Termine</h2><p>Sobald neue Veranstaltungen eingetragen sind, erscheinen sie hier.</p></section>')

    past = [event_card(event, past=True) for event in past_events]
    archive = ""
    if past:
        archive = f'<section class="past-events-section"><div class="past-events-head"><div><span class="eyebrow">Archiv</span><h2>Vergangene Veranstaltungen</h2><p>Rückblicke, Fotos und die zuletzt vergangenen Termine.</p></div><span class="past-events-count">{len(past)} vergangen</span></div><div class="event-list past-event-list">{"".join(past)}</div></section>'

    styles = '<style>.past-events-section{margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}.past-events-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.past-events-head h2{margin:3px 0 4px;color:var(--forest);font-size:22px}.past-events-head p{margin:0;color:var(--muted);font-size:13px}.past-events-count{flex:0 0 auto;padding:6px 10px;border-radius:999px;background:#eef1eb;color:#67736b;font-size:11px;font-weight:850}.event-card.past-event{background:#fbfcf9;border-color:#e3e8df;box-shadow:none}.past-event-label{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:999px;background:#e8ece6;color:#667269;font-size:10px;font-weight:850;vertical-align:middle}.event-recap{margin-top:15px;padding-top:14px;border-top:1px solid #dfe6dc}.event-recap>strong{display:block;margin-bottom:6px;color:var(--forest);font-size:13px;text-transform:uppercase;letter-spacing:.05em}.event-recap>p{margin:0 0 11px;color:#526057;line-height:1.55}.past-event-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.past-event-gallery img{width:100%;aspect-ratio:1.2;object-fit:cover;border-radius:10px;background:#eef1eb}@media(max-width:560px){.past-events-head{align-items:flex-start}.past-events-count{margin-top:2px}.past-event-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>'
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfkalender</span><h1>Veranstaltungen</h1><p>Aktuelle Termine sowie Rückblicke auf vergangene Veranstaltungen in Ahnsen.</p></section>{styles}<div class="event-list">{"".join(upcoming)}</div>{archive}'
    return page("Veranstaltungen", content, active="calendar")
'''
text = text[:start] + new_events + text[end:]
if 'Aktuelle und vergangene Veranstaltungen.' not in text or 'past-event-gallery' not in text:
    raise SystemExit('pwa_ui patch incomplete')
path.write_text(text, encoding='utf-8')
