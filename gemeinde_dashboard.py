from html import escape

from fastapi.responses import HTMLResponse

from gemeinde_crud import DEFAULT_GEMEINDE_EINSTELLUNGEN
from intern_ui import intern_nav, intern_nav_css


def gemeinde_dashboard(einstellungen, hinweis=""):
    def wert(name):
        return escape(einstellungen.get(name, ""))

    def feld(name, label, hinweis_text="", typ="text"):
        help_html = f'<small>{escape(hinweis_text)}</small>' if hinweis_text else ""
        return f"""
        <label class="content-field">
            <span>{escape(label)}</span>{help_html}
            <input type="{typ}" name="{escape(name)}" value="{wert(name)}">
        </label>
        """

    def textfeld(name, label, hinweis_text="", rows=4):
        help_html = f'<small>{escape(hinweis_text)}</small>' if hinweis_text else ""
        return f"""
        <label class="content-field content-field-wide">
            <span>{escape(label)}</span>{help_html}
            <textarea name="{escape(name)}" rows="{rows}">{wert(name)}</textarea>
        </label>
        """

    sichtbare_felder = {
        "seiten_titel",
        "logo_text",
        "hauptfarbe",
        "akzentfarbe",
        "gruen",
        "hero_titel",
        "hero_untertitel",
        "hero_text",
        "hero_bild_url",
        "logo_bild_url",
        "hero_bild_alt",
        "willkommen_text",
        "ueber_ahnsen_text",
        "facebook_url",
        "instagram_url",
        "externe_website_url",
        "kontakt_name",
        "kontakt_adresse",
        "kontakt_email",
        "kontakt_telefon",
        "oeffnungszeiten",
        "wichtige_links",
        "aktuelles",
        "vereine",
        "ansprechpartner",
        "footer_impressum_url",
        "footer_datenschutz_url",
        "portal_intro",
        "suchseite_text",
        "mangel_seite_text",
        "veranstaltungen_seite_text",
        "veranstaltungen_hinweis",
        "dgh_seite_text",
        "dgh_regeln",
        "muell_seite_text",
        "muell_abo_text",
        "buergerinfo_seite_text",
        "buergerinfo_text",
        "ansprechpartner_seite_text",
        "vereine_seite_text",
        "feuerwehr_seite_text",
        "feuerwehr_text",
        "aktuelles_seite_text",
        "ueber_ahnsen_seite_text",
        "impressum_seite_text",
        "datenschutz_seite_text",
    }

    versteckte_felder = "".join(
        f'<input type="hidden" name="{escape(key)}" value="{wert(key)}">'
        for key in DEFAULT_GEMEINDE_EINSTELLUNGEN
        if key not in sichtbare_felder
    )

    message_html = f'<div class="message">✓ {escape(hinweis)}</div>' if hinweis else ""

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>Inhalte & Design · Ahnsen hilft Verwaltung</title>
        <style>
            {intern_nav_css()}

            .content-layout {{ display:grid; grid-template-columns:minmax(240px,.34fr) minmax(0,1fr); gap:20px; align-items:start; }}
            .content-side {{ position:sticky; top:118px; display:grid; gap:12px; }}
            .content-side-card {{ padding:19px; border:1px solid var(--admin-line); border-radius:22px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .content-side-card h2 {{ margin:0 0 8px; font-size:21px !important; }}
            .content-side-card p {{ margin:0; color:var(--admin-muted); font-size:13px; line-height:1.55; }}
            .content-quick-links {{ display:grid; gap:5px; margin-top:14px; }}
            .content-quick-links a {{ min-height:39px; display:flex; align-items:center; padding:8px 10px; border-radius:12px; color:#526057; text-decoration:none; font-size:12px; font-weight:850; }}
            .content-quick-links a:hover {{ color:var(--admin-forest); background:var(--admin-sage-soft); }}
            .content-preview {{ min-height:43px; display:flex; align-items:center; justify-content:center; margin-top:13px; border-radius:13px; color:white !important; background:var(--admin-green); font-weight:850; text-decoration:none; }}

            .content-form {{ display:grid; gap:16px; }}
            .content-section {{ scroll-margin-top:120px; padding:23px; border:1px solid var(--admin-line); border-radius:24px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .content-section-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:18px; }}
            .content-section-head h2 {{ margin:0 0 5px; }}
            .content-section-head p {{ max-width:720px; margin:0; color:var(--admin-muted); line-height:1.5; }}
            .content-section-number {{ width:36px; height:36px; display:grid; place-items:center; flex:0 0 auto; border-radius:12px; color:var(--admin-forest); background:var(--admin-sage-soft); font-size:12px; font-weight:950; }}
            .content-grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:13px; }}
            .content-field {{ display:grid; align-content:start; gap:6px; }}
            .content-field-wide {{ grid-column:1 / -1; }}
            .content-field > span {{ color:#3f4d43; font-size:12px; font-weight:900; }}
            .content-field > small {{ margin-top:-3px; color:var(--admin-muted); line-height:1.4; }}
            .content-field input,.content-field textarea {{ margin:0 !important; }}

            .content-upload-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:15px; }}
            .content-upload-card {{ display:grid; gap:10px; padding:16px; border:1.5px dashed #b8cbb3; border-radius:18px; background:#f7faf4; }}
            .content-upload-card strong {{ color:var(--admin-forest); }}
            .content-upload-card small {{ color:var(--admin-muted); line-height:1.45; }}
            .content-upload-card input,.content-upload-card button {{ margin:0 !important; }}
            .content-upload-card button {{ width:100% !important; }}

            .content-import {{ padding:18px; border:1px solid var(--admin-line); border-radius:18px; background:#f7faf4; }}
            .content-import p {{ margin:0 0 13px; color:#536057; line-height:1.55; }}
            .content-import-row {{ display:grid; grid-template-columns:1fr auto; gap:9px; align-items:end; }}
            .content-import-row input,.content-import-row button {{ margin:0 !important; }}

            .content-actions {{ position:sticky; z-index:30; bottom:12px; display:flex; justify-content:flex-end; gap:8px; padding:11px; border:1px solid rgba(210,222,208,.9); border-radius:19px; background:rgba(255,254,250,.94); box-shadow:0 16px 40px rgba(23,73,54,.16); backdrop-filter:blur(18px); }}
            .content-actions a,.content-actions button {{ margin:0 !important; }}

            @media (max-width:980px) {{ .content-layout {{ grid-template-columns:1fr; }} .content-side {{ position:static; }} .content-quick-links {{ grid-template-columns:repeat(3,minmax(0,1fr)); }} }}
            @media (max-width:700px) {{ .content-grid,.content-upload-grid {{ grid-template-columns:1fr; }} .content-field-wide {{ grid-column:auto; }} .content-quick-links {{ grid-template-columns:1fr 1fr; }} .content-import-row {{ grid-template-columns:1fr; }} }}
            @media (max-width:480px) {{ .content-quick-links {{ grid-template-columns:1fr; }} .content-actions {{ display:grid; }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("gemeindeseite")}

            <section class="admin-hero">
                <span class="admin-eyebrow">Bürger-App gestalten</span>
                <h1>Inhalte & Erscheinungsbild</h1>
                <p>Pflege Texte, Farben, Kontaktangaben, Bilder und öffentliche Inhalte der Ahnsen-PWA an einer zentralen Stelle.</p>
                <div class="admin-hero-actions"><a href="/" target="_blank" rel="noopener">Bürger-App in neuem Fenster öffnen</a></div>
            </section>

            {message_html}

            <div class="content-layout">
                <aside class="content-side">
                    <section class="content-side-card">
                        <h2>Bereiche</h2>
                        <p>Springe direkt zum gewünschten Inhaltsbereich.</p>
                        <nav class="content-quick-links">
                            <a href="#grunddesign">Grunddesign</a>
                            <a href="#startseite">Startseite</a>
                            <a href="#unterseiten">Unterseiten</a>
                            <a href="#listen">Listen</a>
                            <a href="#kontakt">Kontakt</a>
                            <a href="#import">Import</a>
                        </nav>
                        <a class="content-preview" href="/" target="_blank" rel="noopener">Vorschau öffnen</a>
                    </section>
                    <section class="content-side-card">
                        <h2>Hinweis</h2>
                        <p>Legacy-Werte des früheren WhatsApp-Systems bleiben intern erhalten, werden hier aber nicht mehr als aktive PWA-Funktion angezeigt.</p>
                    </section>
                </aside>

                <form class="content-form" method="post" action="/gemeindeseite">
                    {versteckte_felder}

                    <section class="content-section" id="grunddesign">
                        <div class="content-section-head"><div><h2>Grunddesign</h2><p>Seitentitel, Markenfarben und Bildmaterial der Bürger-PWA.</p></div><span class="content-section-number">01</span></div>
                        <div class="content-grid">
                            {feld('seiten_titel', 'Seitentitel')}
                            {feld('logo_text', 'Logo-/Appname')}
                            {feld('hauptfarbe', 'Hauptfarbe', 'Empfohlen: #174936')}
                            {feld('akzentfarbe', 'Akzentfarbe', 'Empfohlen: #287052')}
                            {feld('gruen', 'Salbei-Akzent', 'Empfohlen: #8da77a')}
                            {feld('hero_bild_url', 'Hero-Bild URL', 'Standard: /assets/ahnsen-startseite.png')}
                            {feld('hero_bild_alt', 'Bildbeschreibung', 'Kurzer Alternativtext für Barrierefreiheit')}
                            {feld('logo_bild_url', 'Optionales Logo-Bild')}
                        </div>
                        <div class="content-upload-grid">
                            <div class="content-upload-card"><strong>Hero-Bild hochladen</strong><small>Großes Bild für die Startseite der PWA.</small><input form="upload-hero" type="hidden" name="feld" value="hero_bild_url"><input form="upload-hero" type="file" name="datei" accept="image/png,image/jpeg,image/webp" required><button form="upload-hero" type="submit">Hero-Bild übernehmen</button></div>
                            <div class="content-upload-card"><strong>Logo hochladen</strong><small>Optionales zusätzliches Logo für öffentliche Seiten.</small><input form="upload-logo" type="hidden" name="feld" value="logo_bild_url"><input form="upload-logo" type="file" name="datei" accept="image/png,image/jpeg,image/webp" required><button form="upload-logo" type="submit">Logo übernehmen</button></div>
                        </div>
                    </section>

                    <section class="content-section" id="startseite">
                        <div class="content-section-head"><div><h2>Startseite & Begrüßung</h2><p>Die wichtigsten Texte, die Bürger direkt beim Öffnen der App sehen.</p></div><span class="content-section-number">02</span></div>
                        <div class="content-grid">
                            {feld('hero_titel', 'Hero-Titel')}
                            {feld('hero_untertitel', 'Hero-Untertitel')}
                            {textfeld('hero_text', 'Hero-Kurztext', rows=3)}
                            {textfeld('willkommen_text', 'Begrüßung / Willkommen', rows=4)}
                            {textfeld('portal_intro', 'Startseiten-Übersicht', rows=3)}
                            {textfeld('ueber_ahnsen_text', 'Über Ahnsen', rows=5)}
                        </div>
                    </section>

                    <section class="content-section" id="unterseiten">
                        <div class="content-section-head"><div><h2>Öffentliche Unterseiten</h2><p>Einleitungen, Hinweise und rechtliche Inhalte der einzelnen PWA-Bereiche.</p></div><span class="content-section-number">03</span></div>
                        <div class="content-grid">
                            {textfeld('suchseite_text', 'Suche', rows=3)}
                            {textfeld('mangel_seite_text', 'Mangel melden', rows=3)}
                            {textfeld('veranstaltungen_seite_text', 'Veranstaltungen', rows=3)}
                            {textfeld('veranstaltungen_hinweis', 'Veranstaltungen: Hinweistext', rows=3)}
                            {textfeld('dgh_seite_text', 'DGH mieten', rows=3)}
                            {textfeld('dgh_regeln', 'DGH: Hinweise / Regeln', 'Ein Hinweis pro Zeile', rows=5)}
                            {textfeld('muell_seite_text', 'Mülltermine', rows=3)}
                            {textfeld('muell_abo_text', 'Müll-Push-Erinnerung', rows=3)}
                            {textfeld('buergerinfo_seite_text', 'Bürgerinformationen: Einleitung', rows=3)}
                            {textfeld('buergerinfo_text', 'Bürgerinformationen: Inhalt', rows=6)}
                            {textfeld('ansprechpartner_seite_text', 'Ansprechpartner', rows=3)}
                            {textfeld('vereine_seite_text', 'Vereine', rows=3)}
                            {textfeld('feuerwehr_seite_text', 'Feuerwehr', rows=3)}
                            {textfeld('feuerwehr_text', 'Feuerwehr: Inhalt', rows=5)}
                            {textfeld('aktuelles_seite_text', 'Aktuelles', rows=3)}
                            {textfeld('ueber_ahnsen_seite_text', 'Über Ahnsen: Einleitung', rows=3)}
                            {textfeld('impressum_seite_text', 'Impressum', rows=6)}
                            {textfeld('datenschutz_seite_text', 'Datenschutz', rows=7)}
                        </div>
                    </section>

                    <section class="content-section" id="listen">
                        <div class="content-section-head"><div><h2>Listen & aktuelle Inhalte</h2><p>Strukturierte Einträge für Neuigkeiten, Vereine, Kontakte und wichtige Links.</p></div><span class="content-section-number">04</span></div>
                        <div class="content-grid">
                            {textfeld('aktuelles', 'Aktuelles', 'Eine Meldung pro Zeile: Titel|Text', rows=6)}
                            {textfeld('vereine', 'Vereine', 'Ein Verein pro Zeile: Name|Beschreibung', rows=6)}
                            {textfeld('ansprechpartner', 'Ansprechpartner', 'Eine Zeile: Rolle|Name/Info', rows=5)}
                            {textfeld('wichtige_links', 'Wichtige Links', 'Eine Zeile: Titel|URL oder #abschnitt', rows=5)}
                        </div>
                    </section>

                    <section class="content-section" id="kontakt">
                        <div class="content-section-head"><div><h2>Kontakt, soziale Netzwerke & Rechtliches</h2><p>Kontaktdaten und externe Verknüpfungen für Bürger.</p></div><span class="content-section-number">05</span></div>
                        <div class="content-grid">
                            {feld('kontakt_name', 'Kontaktname')}
                            {feld('kontakt_adresse', 'Adresse')}
                            {feld('kontakt_email', 'E-Mail', typ='email')}
                            {feld('kontakt_telefon', 'Telefon')}
                            {feld('oeffnungszeiten', 'Öffnungszeiten')}
                            {feld('facebook_url', 'Facebook-Link')}
                            {feld('instagram_url', 'Instagram-Link')}
                            {feld('externe_website_url', 'Externe Website')}
                            {feld('footer_impressum_url', 'Impressum-Link')}
                            {feld('footer_datenschutz_url', 'Datenschutz-Link')}
                        </div>
                    </section>

                    <section class="content-section" id="import">
                        <div class="content-section-head"><div><h2>Inhalte der alten Homepage übernehmen</h2><p>Bestehende Dorftexte können erneut importiert und anschließend hier bearbeitet werden.</p></div><span class="content-section-number">06</span></div>
                        <div class="content-import"><p>Importiert Begrüßung, Bürgerinformationen, Vereine, wichtige Links, Geschichte und aktuelle Hinweise aus der bisherigen Ahnsen-Homepage.</p><div class="content-import-row"><label class="content-field"><span>Quelle</span><input form="import-alt" name="url" value="https://www.ahnsen-schaumburg.de/"></label><button form="import-alt" type="submit">Inhalte übernehmen</button></div></div>
                    </section>

                    <div class="content-actions"><a class="secondary" href="/">Abbrechen</a><button type="submit">Alle Änderungen speichern</button></div>
                </form>
            </div>

            <form id="upload-hero" method="post" action="/gemeindeseite/upload" enctype="multipart/form-data"></form>
            <form id="upload-logo" method="post" action="/gemeindeseite/upload" enctype="multipart/form-data"></form>
            <form id="import-alt" method="post" action="/gemeindeseite/import-alt"></form>
        </main>
    </body>
    </html>
    """
    return HTMLResponse(html)
