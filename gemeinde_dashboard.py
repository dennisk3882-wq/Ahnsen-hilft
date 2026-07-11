from html import escape

from fastapi.responses import HTMLResponse

from gemeinde_crud import DEFAULT_GEMEINDE_EINSTELLUNGEN


def gemeinde_dashboard(einstellungen, hinweis=""):
    def wert(name):
        return escape(einstellungen.get(name, ""))

    def feld(name, label, hinweis_text="", typ="text"):
        extra = (
            f'<small class="hint">{escape(hinweis_text)}</small>'
            if hinweis_text
            else ""
        )
        return f"""
        <label>
            <span>{escape(label)}</span>
            {extra}
            <input type="{typ}" name="{escape(name)}" value="{wert(name)}">
        </label>
        """

    def textfeld(name, label, hinweis_text="", rows=4):
        extra = (
            f'<small class="hint">{escape(hinweis_text)}</small>'
            if hinweis_text
            else ""
        )
        return f"""
        <label>
            <span>{escape(label)}</span>
            {extra}
            <textarea name="{escape(name)}" rows="{rows}">{wert(name)}</textarea>
        </label>
        """

    versteckte_felder = ""
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
        "whatsapp_nummer",
        "whatsapp_link",
        "whatsapp_qr_url",
        "whatsapp_text",
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
        "whatsapp_seite_text",
        "ueber_ahnsen_seite_text",
        "impressum_seite_text",
        "datenschutz_seite_text",
    }

    for schluessel in DEFAULT_GEMEINDE_EINSTELLUNGEN:
        if schluessel not in sichtbare_felder:
            versteckte_felder += (
                f'<input type="hidden" name="{escape(schluessel)}" '
                f'value="{wert(schluessel)}">'
            )

    hinweis_html = (
        f'<div class="message">✅ {escape(hinweis)}</div>' if hinweis else ""
    )

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Gemeindeseite bearbeiten · Ahnsen hilft</title>
        <style>
            body {{
                margin:0;
                padding:24px;
                font-family:Inter, "Segoe UI", Arial, sans-serif;
                color:#203142;
                background:#eef4f6;
            }}

            .wrap {{
                max-width:1180px;
                margin:auto;
            }}

            .top-nav {{
                display:flex;
                flex-wrap:wrap;
                gap:10px;
                margin-bottom:20px;
            }}

            .top-nav a {{
                padding:10px 14px;
                border-radius:999px;
                color:white;
                background:#17324d;
                text-decoration:none;
                font-weight:800;
            }}

            .hero {{
                margin-bottom:22px;
                padding:28px;
                border-radius:24px;
                color:white;
                background:linear-gradient(135deg, #17324d, #2f6f9f);
                box-shadow:0 22px 55px rgba(23,50,77,.18);
            }}

            .hero h1 {{
                margin:0 0 8px;
                font-size:clamp(30px, 5vw, 52px);
            }}

            .hero p {{
                max-width:720px;
                margin:0;
                color:rgba(255,255,255,.84);
                line-height:1.55;
            }}

            .message {{
                margin-bottom:18px;
                padding:14px 16px;
                border-radius:14px;
                color:#155724;
                background:#d4edda;
                font-weight:800;
            }}

            form {{
                display:grid;
                gap:18px;
            }}

            .section {{
                padding:22px;
                border-radius:22px;
                background:white;
                box-shadow:0 12px 36px rgba(34,58,78,.09);
            }}

            .section h2 {{
                margin:0 0 16px;
                color:#17324d;
            }}

            .grid {{
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                gap:15px;
            }}

            label span {{
                display:block;
                margin-bottom:6px;
                font-weight:900;
                color:#30475c;
            }}

            .hint {{
                display:block;
                margin:-2px 0 7px;
                color:#74818c;
                line-height:1.35;
            }}

            input,
            textarea {{
                width:100%;
                padding:12px 13px;
                border:1px solid #cfd9df;
                border-radius:12px;
                color:#203142;
                background:#fbfdfe;
                font:inherit;
                box-sizing:border-box;
            }}

            input:focus,
            textarea:focus {{
                border-color:#2f6f9f;
                outline:none;
                box-shadow:0 0 0 4px rgba(47,111,159,.12);
            }}

            textarea {{
                resize:vertical;
            }}

            .actions {{
                position:sticky;
                bottom:16px;
                display:flex;
                justify-content:flex-end;
                gap:10px;
                padding:14px;
                border:1px solid rgba(255,255,255,.75);
                border-radius:18px;
                background:rgba(255,255,255,.88);
                backdrop-filter:blur(14px);
                box-shadow:0 16px 38px rgba(34,58,78,.15);
            }}

            button,
            .secondary {{
                border:0;
                border-radius:999px;
                padding:12px 18px;
                font-weight:900;
                cursor:pointer;
                text-decoration:none;
            }}

            button {{
                color:white;
                background:#2f6f9f;
            }}

            .secondary {{
                color:#17324d;
                background:#e8f0f5;
            }}

            @media (max-width:760px) {{
                body {{
                    padding:14px;
                }}

                .grid {{
                    grid-template-columns:1fr;
                }}

                .actions {{
                    display:grid;
                }}
            }}
        </style>
    </head>
    <body>
        <main class="wrap">
            <nav class="top-nav">
                <a href="/">⌂ Start</a>
                <a href="/intern/maengel">📋 Mängel</a>
                <a href="/intern/veranstaltungen">📅 Veranstaltungen</a>
                <a href="/intern/dgh">🏠 DGH</a>
                <a href="/intern/muelltermine">🗑️ Müllabfuhr Termine</a>
            </nav>

            <section class="hero">
                <h1>Gemeindeseite bearbeiten</h1>
                <p>
                    Pflege hier Texte, Farben, Kontaktangaben, Links und die
                    öffentlichen Inhalte der neuen Homepage.
                </p>
            </section>

            {hinweis_html}

            <form method="post" action="/gemeindeseite">
                {versteckte_felder}

                <section class="section">
                    <h2>Grunddesign</h2>
                    <div class="grid">
                        {feld("seiten_titel", "Seitentitel")}
                        {feld("logo_text", "Logo-/Seitennamen")}
                        {feld("hauptfarbe", "Hauptfarbe", "z. B. #17324d")}
                        {feld("akzentfarbe", "Akzentfarbe", "z. B. #2f6f9f")}
                        {feld("gruen", "Grün-Akzent", "z. B. #6d8f49")}
                        {feld("hero_bild_url", "Hero-Bild URL", "Standard: /assets/ahnsen-startseite.png")}
                        {feld("hero_bild_alt", "Hero-Bild Beschreibung", "Kurzer Alternativtext für Barrierefreiheit")}
                        {feld("logo_bild_url", "Logo-Bild URL", "Optional: Bildadresse für ein Logo")}
                    </div>
                </section>

                <section class="section">
                    <h2>Hero & Begrüßung</h2>
                    <div class="grid">
                        {feld("hero_titel", "Hero-Titel")}
                        {feld("hero_untertitel", "Hero-Untertitel")}
                    </div>
                    {textfeld("hero_text", "Hero-Kurztext", rows=3)}
                    {textfeld("willkommen_text", "Begrüßung / Willkommen", rows=4)}
                    {textfeld("ueber_ahnsen_text", "Über Ahnsen", rows=4)}
                </section>

                <section class="section">
                    <h2>Öffentliche Unterseiten</h2>
                    {textfeld("portal_intro", "Startseiten-Übersicht", rows=3)}
                    {textfeld("suchseite_text", "Seite: Suche", rows=3)}
                    {textfeld("mangel_seite_text", "Seite: Mangel melden", rows=3)}
                    {textfeld("veranstaltungen_seite_text", "Seite: Veranstaltungen", rows=3)}
                    {textfeld("veranstaltungen_hinweis", "Veranstaltungen: Hinweistext", rows=3)}
                    {textfeld("dgh_seite_text", "Seite: DGH mieten", rows=3)}
                    {textfeld("dgh_regeln", "DGH: Hinweise / Regeln", "Ein Hinweis pro Zeile", rows=5)}
                    {textfeld("muell_seite_text", "Seite: Mülltermine", rows=3)}
                    {textfeld("muell_abo_text", "Mülltermine: Erinnerungstext", rows=3)}
                    {textfeld("whatsapp_seite_text", "Seite: WhatsApp-Bot", rows=3)}
                    {textfeld("buergerinfo_seite_text", "Seite: Bürgerinformationen", rows=3)}
                    {textfeld("buergerinfo_text", "Bürgerinformationen Inhalt", rows=6)}
                    {textfeld("ansprechpartner_seite_text", "Seite: Ansprechpartner", rows=3)}
                    {textfeld("vereine_seite_text", "Seite: Vereine", rows=3)}
                    {textfeld("feuerwehr_seite_text", "Seite: Feuerwehr", rows=3)}
                    {textfeld("feuerwehr_text", "Feuerwehr Inhalt", rows=5)}
                    {textfeld("aktuelles_seite_text", "Seite: Aktuelles", rows=3)}
                    {textfeld("ueber_ahnsen_seite_text", "Seite: Über Ahnsen", rows=3)}
                    {textfeld("impressum_seite_text", "Seite: Impressum", rows=6)}
                    {textfeld("datenschutz_seite_text", "Seite: Datenschutz", rows=6)}
                </section>

                <section class="section">
                    <h2>WhatsApp-Bot</h2>
                    <div class="grid">
                        {feld("whatsapp_nummer", "WhatsApp-Nummer")}
                        {feld("whatsapp_link", "WhatsApp-Link", "z. B. https://wa.me/49...")}
                        {feld("whatsapp_qr_url", "WhatsApp QR-Code Bild URL", "Optional: Bildadresse eines QR-Codes")}
                    </div>
                    {textfeld("whatsapp_text", "Beschreibung des WhatsApp-Bots", rows=4)}
                </section>

                <section class="section">
                    <h2>Listen & Inhalte</h2>
                    {textfeld("aktuelles", "Aktuelles", "Eine Meldung pro Zeile: Titel|Text", rows=5)}
                    {textfeld("vereine", "Vereine", "Ein Verein pro Zeile: Name|Beschreibung", rows=5)}
                    {textfeld("ansprechpartner", "Ansprechpartner", "Eine Zeile: Rolle|Name/Info", rows=4)}
                    {textfeld("wichtige_links", "Wichtige Links", "Eine Zeile: Titel|URL oder #abschnitt", rows=5)}
                </section>

                <section class="section">
                    <h2>Kontakt & Footer</h2>
                    <div class="grid">
                        {feld("kontakt_name", "Kontaktname")}
                        {feld("kontakt_adresse", "Adresse")}
                        {feld("kontakt_email", "E-Mail", typ="email")}
                        {feld("kontakt_telefon", "Telefon")}
                        {feld("oeffnungszeiten", "Öffnungszeiten")}
                        {feld("footer_impressum_url", "Impressum-Link")}
                        {feld("footer_datenschutz_url", "Datenschutz-Link")}
                        {feld("facebook_url", "Facebook-Link")}
                        {feld("instagram_url", "Instagram-Link")}
                        {feld("externe_website_url", "Externe Website")}
                    </div>
                </section>

                <div class="actions">
                    <a class="secondary" href="/">Abbrechen</a>
                    <button type="submit">Änderungen speichern</button>
                </div>
            </form>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)
