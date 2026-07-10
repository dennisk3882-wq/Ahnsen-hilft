from html import escape
from urllib.parse import quote

from fastapi.responses import HTMLResponse


GRUNDSTIL = """
    :root {
        color-scheme: light;
        --navy:#17324d;
        --blue:#2f6f9f;
        --green:#6d8f49;
        --gold:#d2a23c;
        --ink:#203142;
    }

    * {
        box-sizing:border-box;
    }

    body {
        margin:0;
        min-height:100vh;
        font-family:Inter, "Segoe UI", Arial, sans-serif;
        color:var(--ink);
        background:
            linear-gradient(105deg, rgba(255,255,255,.22), rgba(232,240,247,.08)),
            url("/assets/ahnsen-startseite.png") center center / cover fixed;
    }

    body::before {
        content:"";
        position:fixed;
        inset:0;
        pointer-events:none;
        background:linear-gradient(
            90deg,
            rgba(255,255,255,.16) 0%,
            rgba(255,255,255,.06) 55%,
            rgba(18,43,64,.10) 100%
        );
    }

    button,
    a {
        font:inherit;
    }

    .page {
        position:relative;
        z-index:1;
        min-height:100vh;
        padding:32px;
    }

    .brand {
        display:flex;
        align-items:center;
        gap:12px;
        color:var(--navy);
    }

    .brand-mark {
        width:48px;
        height:48px;
        border-radius:16px;
        display:grid;
        place-items:center;
        color:white;
        font-size:24px;
        background:linear-gradient(135deg, var(--navy), var(--blue));
        box-shadow:0 10px 25px rgba(23,50,77,.22);
    }

    .brand strong {
        display:block;
        font-size:21px;
    }

    .brand small {
        display:block;
        margin-top:2px;
        color:#607080;
    }

    @media (max-width:700px) {
        body {
            background-position:62% center;
        }

        .page {
            padding:18px;
        }
    }
"""


def login_page(fehler=""):
    fehler_html = ""
    if fehler:
        fehler_html = (
            f'<div class="error" role="alert">⚠️ {escape(fehler)}</div>'
        )

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Anmelden · Ahnsen hilft</title>
        <style>
            {GRUNDSTIL}

            .login-layout {{
                display:flex;
                flex-direction:column;
            }}

            .login-card {{
                width:min(420px, 100%);
                margin:auto;
                padding:34px;
                border:1px solid rgba(255,255,255,.72);
                border-radius:24px;
                background:rgba(255,255,255,.88);
                box-shadow:0 24px 70px rgba(34,58,78,.22);
                backdrop-filter:blur(18px);
            }}

            .login-card h1 {{
                margin:28px 0 8px;
                color:var(--navy);
                font-size:31px;
            }}

            .intro {{
                margin:0 0 26px;
                color:#5f6f7d;
                line-height:1.55;
            }}

            label {{
                display:block;
                margin:0 0 7px;
                font-weight:700;
                color:#314659;
            }}

            input {{
                width:100%;
                margin:0 0 17px;
                padding:13px 14px;
                border:1px solid #cbd5dd;
                border-radius:11px;
                background:rgba(255,255,255,.94);
                color:#203142;
                font-size:16px;
                outline:none;
                transition:.18s ease;
            }}

            input:focus {{
                border-color:var(--blue);
                box-shadow:0 0 0 4px rgba(47,111,159,.14);
            }}

            .login-button {{
                width:100%;
                margin-top:5px;
                padding:14px;
                border:0;
                border-radius:11px;
                color:white;
                background:linear-gradient(135deg, var(--navy), var(--blue));
                box-shadow:0 10px 24px rgba(47,111,159,.25);
                font-weight:800;
                cursor:pointer;
            }}

            .login-button:hover {{
                filter:brightness(1.06);
                transform:translateY(-1px);
            }}

            .error {{
                margin:0 0 18px;
                padding:11px 13px;
                border-left:5px solid #c0392b;
                border-radius:9px;
                color:#7d261d;
                background:#fdecea;
            }}

            .privacy {{
                margin:20px 0 0;
                color:#7a8792;
                text-align:center;
                font-size:12px;
            }}

            @media (max-width:500px) {{
                .login-card {{
                    padding:25px 21px;
                }}

                .login-card h1 {{
                    font-size:27px;
                }}
            }}
        </style>
    </head>
    <body>
        <main class="page login-layout">
            <section class="login-card">
                <div class="brand">
                    <div class="brand-mark">⌂</div>
                    <div>
                        <strong>Ahnsen hilft</strong>
                        <small>Dorfverwaltung</small>
                    </div>
                </div>

                <h1>Willkommen zurück</h1>
                <p class="intro">
                    Melde dich an, um Meldungen, Veranstaltungen,
                    DGH-Buchungen und Müllabfuhrtermine zu verwalten.
                </p>

                {fehler_html}

                <form method="post" action="/login">
                    <label for="username">Benutzername</label>
                    <input id="username" name="username" autocomplete="username"
                           required autofocus>

                    <label for="password">Passwort</label>
                    <input id="password" name="password" type="password"
                           autocomplete="current-password" required>

                    <button class="login-button" type="submit">
                        Sicher anmelden
                    </button>
                </form>

                <p class="privacy">Geschützter Verwaltungsbereich</p>
            </section>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)


def _datum_zeit(wert):
    if not wert:
        return "-"
    return wert.strftime("%d.%m.%Y %H:%M")


def _render_abonnenten(abonnements):
    rows = ""

    for abo in abonnements:
        name = abo.get("name") or "Unbekannt"
        aktiv = bool(abo.get("aktiv"))
        neue_aktivitaet = "Nein" if aktiv else "Ja"
        status_text = "Aktiv" if aktiv else "Inaktiv"
        button_text = "Deaktivieren" if aktiv else "Aktivieren"
        status_class = "active" if aktiv else "inactive"

        rows += f"""
        <tr>
            <td data-label="Name">{escape(name)}</td>
            <td data-label="WhatsApp-Nummer">
                {escape(abo.get("whatsapp_nummer") or "")}
            </td>
            <td data-label="Abonnement">
                {escape(abo.get("abonnement") or "")}
            </td>
            <td data-label="Status">
                <form class="toggle-form"
                      method="post"
                      action="/abonnements/{escape(abo.get("typ") or "")}/{abo.get("id")}/status">
                    <span class="status-pill {status_class}">{status_text}</span>
                    <input type="hidden" name="aktiv" value="{neue_aktivitaet}">
                    <button class="{status_class}" type="submit">
                        {button_text}
                    </button>
                </form>
            </td>
        </tr>
        """

    if not rows:
        rows = """
        <tr>
            <td colspan="4" class="table-empty">
                Noch keine Abonnenten vorhanden.
            </td>
        </tr>
        """

    return f"""
    <section class="data-section" id="abonnenten">
        <div class="section-title">
            <div>
                <span class="eyebrow">Benachrichtigungen</span>
                <h2>Abonnenten</h2>
            </div>
        </div>
        <p class="section-note">
            Hier siehst du, wer Erinnerungen abonniert hat. Änderungen werden
            sofort gespeichert und gelten direkt für die WhatsApp-Erinnerungen.
        </p>
        <div class="responsive-table">
            <table>
                <tr>
                    <th>Name</th>
                    <th>WhatsApp-Nummer</th>
                    <th>Abonnement</th>
                    <th>Status</th>
                </tr>
                {rows}
            </table>
        </div>
    </section>
    """


def _render_chatbot_verlauf(chats):
    rows = ""

    for chat in chats:
        name = chat.get("name") or "Unbekannt"
        nummer = chat.get("whatsapp_nummer") or ""
        link = f"/chatbot/{quote(str(nummer), safe='')}"

        rows += f"""
        <tr>
            <td data-label="Name">
                <a class="table-link" href="{link}">{escape(name)}</a>
            </td>
            <td data-label="WhatsApp-Nummer">
                <a class="table-link" href="{link}">{escape(nummer)}</a>
            </td>
            <td data-label="Zuletzt aktiv">
                {_datum_zeit(chat.get("zuletzt_aktiv"))}
            </td>
        </tr>
        """

    if not rows:
        rows = """
        <tr>
            <td colspan="3" class="table-empty">
                Noch kein gespeicherter Chatbot-Verlauf vorhanden.
            </td>
        </tr>
        """

    return f"""
    <section class="data-section" id="chatbot-verlauf">
        <div class="section-title">
            <div>
                <span class="eyebrow">WhatsApp</span>
                <h2>Chatbot-Verlauf</h2>
            </div>
        </div>
        <p class="section-note">
            Die neuesten Unterhaltungen stehen oben. Klicke auf Name oder
            Nummer, um den vollständigen Chatverlauf zu öffnen.
        </p>
        <div class="responsive-table">
            <table>
                <tr>
                    <th>Name</th>
                    <th>WhatsApp-Nummer</th>
                    <th>Zuletzt aktiv</th>
                </tr>
                {rows}
            </table>
        </div>
    </section>
    """


def start_page(uebersicht=None, suche=""):
    uebersicht = uebersicht or {}
    meldungs_statistik = uebersicht.get("meldungs_statistik", {})
    offene_meldungen = meldungs_statistik.get("offen", 0)
    meldungen_in_bearbeitung = meldungs_statistik.get("bearbeitung", 0)
    offene_dgh_anfragen = uebersicht.get("offene_dgh_anfragen", 0)
    kommende_veranstaltungen = uebersicht.get(
        "kommende_veranstaltungen",
        0,
    )
    ueberfaellige_meldungen = uebersicht.get(
        "ueberfaellige_meldungen",
        [],
    )
    abonnenten_html = _render_abonnenten(
        uebersicht.get("abonnements", []),
    )
    chatbot_verlauf_html = _render_chatbot_verlauf(
        uebersicht.get("chatbot_verlauf", []),
    )

    warnung_html = ""
    if ueberfaellige_meldungen:
        anzahl = len(ueberfaellige_meldungen)
        meldung_wort = "Meldung" if anzahl == 1 else "Meldungen"
        warnung_html = f"""
        <a class="attention" href="/dashboard?status_filter=Offen">
            <span class="attention-icon">!</span>
            <span>
                <strong>{anzahl} länger offene {meldung_wort}</strong>
                <small>
                    Seit mehr als sieben Tagen nicht erledigt · jetzt prüfen
                </small>
            </span>
            <b>→</b>
        </a>
        """

    letzte_meldungen_html = ""
    for meldung in uebersicht.get("letzte_meldungen", []):
        erstellt = (
            meldung.erstellt_am.strftime("%d.%m.%Y")
            if meldung.erstellt_am
            else "-"
        )
        letzte_meldungen_html += f"""
        <a class="overview-row" href="/meldung/{escape(meldung.ticket)}">
            <span>
                <strong>{escape(meldung.art or "Meldung")}</strong>
                <small>{escape(meldung.ort or "-")} · {erstellt}</small>
            </span>
            <b>→</b>
        </a>
        """

    dgh_anfragen_html = ""
    for termin in uebersicht.get("naechste_dgh_anfragen", []):
        dgh_anfragen_html += f"""
        <a class="overview-row" href="/dgh?bearbeiten_id={termin.id}#formular">
            <span>
                <strong>{escape(termin.anlass or "DGH-Anfrage")}</strong>
                <small>
                    {escape(termin.datum or "-")} ·
                    {escape(termin.name or "Ohne Namen")}
                </small>
            </span>
            <b>→</b>
        </a>
        """

    veranstaltungen_html = ""
    for veranstaltung in uebersicht.get(
        "naechste_veranstaltungen",
        [],
    ):
        veranstaltungen_html += f"""
        <a class="overview-row"
           href="/veranstaltungen?bearbeiten_id={veranstaltung.id}">
            <span>
                <strong>{escape(veranstaltung.titel or "Veranstaltung")}</strong>
                <small>
                    {escape(veranstaltung.datum or "-")} ·
                    {escape(veranstaltung.ort or "-")}
                </small>
            </span>
            <b>→</b>
        </a>
        """

    suchergebnisse_html = ""
    if suche.strip():
        ergebnisse = uebersicht.get("suchergebnisse", {})
        treffer_html = ""

        for meldung in ergebnisse.get("meldungen", []):
            treffer_html += f"""
            <a class="search-result" href="/meldung/{escape(meldung.ticket)}">
                <span class="result-type">Mangel</span>
                <strong>{escape(meldung.art or "Meldung")}</strong>
                <small>{escape(meldung.ort or "-")}</small>
            </a>
            """

        for veranstaltung in ergebnisse.get("veranstaltungen", []):
            treffer_html += f"""
            <a class="search-result"
               href="/veranstaltungen?bearbeiten_id={veranstaltung.id}">
                <span class="result-type">Veranstaltung</span>
                <strong>{escape(veranstaltung.titel or "-")}</strong>
                <small>
                    {escape(veranstaltung.datum or "-")} ·
                    {escape(veranstaltung.ort or "-")}
                </small>
            </a>
            """

        for termin in ergebnisse.get("dgh", []):
            treffer_html += f"""
            <a class="search-result" href="/dgh?bearbeiten_id={termin.id}#formular">
                <span class="result-type">DGH</span>
                <strong>{escape(termin.anlass or "DGH-Termin")}</strong>
                <small>
                    {escape(termin.datum or "-")} ·
                    {escape(termin.name or "-")}
                </small>
            </a>
            """

        if not treffer_html:
            treffer_html = (
                '<p class="empty-state">Keine passenden Einträge gefunden.</p>'
            )

        suchergebnisse_html = f"""
        <section class="search-results">
            <div class="section-title">
                <div>
                    <span class="eyebrow">Suchergebnisse</span>
                    <h2>Treffer für „{escape(suche)}“</h2>
                </div>
                <a href="/">Suche schließen</a>
            </div>
            <div class="result-grid">{treffer_html}</div>
        </section>
        """

    if not letzte_meldungen_html:
        letzte_meldungen_html = '<p class="empty-state">Noch keine Meldungen.</p>'
    if not dgh_anfragen_html:
        dgh_anfragen_html = '<p class="empty-state">Keine offenen Anfragen.</p>'
    if not veranstaltungen_html:
        veranstaltungen_html = (
            '<p class="empty-state">Keine kommenden Veranstaltungen.</p>'
        )

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Verwaltung · Ahnsen hilft</title>
        <style>
            {GRUNDSTIL}

            .home {{
                max-width:1120px;
                margin:0 auto;
            }}

            .topbar {{
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:20px;
                padding:18px 20px;
                border:1px solid rgba(255,255,255,.72);
                border-radius:20px;
                background:rgba(255,255,255,.82);
                box-shadow:0 14px 45px rgba(34,58,78,.14);
                backdrop-filter:blur(16px);
            }}

            .logout {{
                padding:10px 14px;
                border:1px solid #c7d0d8;
                border-radius:10px;
                background:rgba(255,255,255,.9);
                color:#3d5264;
                cursor:pointer;
                font-weight:700;
            }}

            .logout:hover {{
                border-color:#9baab6;
                background:white;
            }}

            .hero {{
                max-width:760px;
                margin:80px 0 34px;
            }}

            .eyebrow {{
                display:inline-block;
                padding:7px 11px;
                border-radius:999px;
                color:#315b2d;
                background:rgba(233,244,226,.86);
                font-size:13px;
                font-weight:800;
                letter-spacing:.04em;
                text-transform:uppercase;
            }}

            .hero h1 {{
                margin:15px 0 12px;
                color:var(--navy);
                font-size:clamp(38px, 6vw, 66px);
                line-height:1.02;
                letter-spacing:-.04em;
            }}

            .hero p {{
                max-width:650px;
                margin:0;
                color:#4f6374;
                font-size:18px;
                line-height:1.6;
            }}

            .global-search {{
                display:flex;
                gap:10px;
                max-width:720px;
                margin:0 0 22px;
                padding:9px;
                border:1px solid rgba(255,255,255,.75);
                border-radius:16px;
                background:rgba(255,255,255,.86);
                box-shadow:0 14px 38px rgba(34,58,78,.12);
                backdrop-filter:blur(16px);
            }}

            .global-search input {{
                flex:1;
                min-width:0;
                padding:11px 13px;
                border:0;
                outline:0;
                background:transparent;
                color:var(--ink);
                font-size:15px;
            }}

            .global-search button {{
                padding:10px 17px;
                border:0;
                border-radius:10px;
                color:white;
                background:var(--navy);
                font-weight:800;
                cursor:pointer;
            }}

            .stats {{
                display:grid;
                grid-template-columns:repeat(4, 1fr);
                gap:12px;
                margin-bottom:18px;
            }}

            .stat {{
                padding:17px;
                border:1px solid rgba(255,255,255,.72);
                border-radius:16px;
                background:rgba(255,255,255,.84);
                box-shadow:0 12px 32px rgba(34,58,78,.11);
                backdrop-filter:blur(14px);
            }}

            .stat b {{
                display:block;
                color:var(--navy);
                font-size:29px;
                line-height:1;
            }}

            .stat span {{
                display:block;
                margin-top:7px;
                color:#667888;
                font-size:13px;
                font-weight:700;
            }}

            .attention {{
                display:flex;
                align-items:center;
                gap:13px;
                margin-bottom:18px;
                padding:14px 16px;
                border:1px solid #f0c9a7;
                border-radius:15px;
                color:#6f3c15;
                text-decoration:none;
                background:rgba(255,241,224,.92);
            }}

            .attention > b {{
                margin-left:auto;
                font-size:22px;
            }}

            .attention-icon {{
                width:35px;
                height:35px;
                display:grid;
                place-items:center;
                flex:0 0 auto;
                border-radius:12px;
                color:white;
                background:#d67a2d;
                font-weight:900;
            }}

            .attention strong,
            .attention small {{
                display:block;
            }}

            .attention small {{
                margin-top:3px;
                color:#94613a;
            }}

            .modules {{
                display:grid;
                grid-template-columns:repeat(4, 1fr);
                gap:18px;
            }}

            .module {{
                min-height:225px;
                padding:24px;
                border:1px solid rgba(255,255,255,.75);
                border-radius:22px;
                color:inherit;
                text-decoration:none;
                background:rgba(255,255,255,.88);
                box-shadow:0 18px 48px rgba(34,58,78,.15);
                backdrop-filter:blur(16px);
                transition:transform .2s ease, box-shadow .2s ease;
            }}

            .module:hover {{
                transform:translateY(-5px);
                box-shadow:0 24px 55px rgba(34,58,78,.22);
            }}

            .module-icon {{
                width:56px;
                height:56px;
                display:grid;
                place-items:center;
                border-radius:17px;
                color:white;
                font-size:27px;
                box-shadow:0 9px 22px rgba(0,0,0,.13);
            }}

            .reports .module-icon {{
                background:linear-gradient(135deg, #c85749, #e27a55);
            }}

            .events .module-icon {{
                background:linear-gradient(135deg, #315f8b, #4d91bd);
            }}

            .dgh .module-icon {{
                background:linear-gradient(135deg, #52743e, #86a85c);
            }}

            .waste .module-icon {{
                background:linear-gradient(135deg, #6a4c32, #a77a49);
            }}

            .module h2 {{
                margin:22px 0 9px;
                color:var(--navy);
                font-size:23px;
            }}

            .module p {{
                margin:0;
                color:#627180;
                line-height:1.5;
            }}

            .module .open {{
                display:block;
                margin-top:17px;
                color:var(--blue);
                font-weight:800;
            }}

            .search-results,
            .overview {{
                margin-top:28px;
                padding:22px;
                border:1px solid rgba(255,255,255,.75);
                border-radius:22px;
                background:rgba(255,255,255,.90);
                box-shadow:0 18px 48px rgba(34,58,78,.14);
                backdrop-filter:blur(16px);
            }}

            .section-title {{
                display:flex;
                align-items:flex-end;
                justify-content:space-between;
                gap:20px;
                margin-bottom:16px;
            }}

            .section-title h2 {{
                margin:7px 0 0;
                color:var(--navy);
            }}

            .section-title a {{
                color:var(--blue);
                font-weight:800;
                text-decoration:none;
            }}

            .result-grid {{
                display:grid;
                grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));
                gap:10px;
            }}

            .search-result {{
                padding:14px;
                border:1px solid #dce4ea;
                border-radius:12px;
                color:inherit;
                text-decoration:none;
                background:#f9fbfc;
            }}

            .search-result:hover {{
                border-color:#9db8cb;
                background:white;
            }}

            .search-result strong,
            .search-result small {{
                display:block;
            }}

            .search-result small {{
                margin-top:5px;
                color:#6e7d89;
            }}

            .result-type {{
                display:inline-block;
                margin-bottom:8px;
                padding:4px 7px;
                border-radius:999px;
                color:#315b75;
                background:#e5f0f7;
                font-size:10px;
                font-weight:900;
                text-transform:uppercase;
            }}

            .overview-grid {{
                display:grid;
                grid-template-columns:repeat(3, 1fr);
                gap:18px;
            }}

            .overview-column h3 {{
                margin:0 0 11px;
                color:var(--navy);
                font-size:17px;
            }}

            .overview-row {{
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                padding:11px 0;
                border-bottom:1px solid #e6eaed;
                color:inherit;
                text-decoration:none;
            }}

            .overview-row:last-child {{
                border-bottom:0;
            }}

            .overview-row strong,
            .overview-row small {{
                display:block;
            }}

            .overview-row small {{
                margin-top:4px;
                color:#74818c;
                font-size:12px;
            }}

            .overview-row > b {{
                color:var(--blue);
            }}

            .data-section {{
                margin-top:28px;
                padding:22px;
                border:1px solid rgba(255,255,255,.75);
                border-radius:22px;
                background:rgba(255,255,255,.92);
                box-shadow:0 18px 48px rgba(34,58,78,.14);
                backdrop-filter:blur(16px);
            }}

            .section-note {{
                margin:-4px 0 16px;
                color:#647482;
                line-height:1.5;
            }}

            .responsive-table {{
                overflow-x:auto;
                border-radius:15px;
                border:1px solid #e1e6ea;
                background:white;
            }}

            .responsive-table table {{
                width:100%;
                min-width:720px;
                border-collapse:collapse;
            }}

            .responsive-table th {{
                padding:13px 14px;
                text-align:left;
                color:white;
                background:var(--navy);
                font-size:13px;
            }}

            .responsive-table td {{
                padding:13px 14px;
                border-bottom:1px solid #e7ecef;
                vertical-align:middle;
            }}

            .responsive-table tr:last-child td {{
                border-bottom:0;
            }}

            .responsive-table tr:hover td {{
                background:#f8fbfd;
            }}

            .table-link {{
                color:var(--blue);
                font-weight:800;
                text-decoration:none;
            }}

            .table-link:hover {{
                text-decoration:underline;
            }}

            .table-empty {{
                color:#74818c;
                text-align:center;
                background:#f7f9fa;
            }}

            .toggle-form {{
                display:flex;
                align-items:center;
                flex-wrap:wrap;
                gap:8px;
                margin:0;
            }}

            .toggle-form button {{
                border:0;
                border-radius:999px;
                padding:8px 12px;
                color:white;
                font-weight:800;
                cursor:pointer;
            }}

            .toggle-form button.active {{
                background:#c85749;
            }}

            .toggle-form button.inactive {{
                background:#52743e;
            }}

            .status-pill {{
                display:inline-block;
                border-radius:999px;
                padding:6px 10px;
                font-size:12px;
                font-weight:900;
            }}

            .status-pill.active {{
                color:#155724;
                background:#d4edda;
            }}

            .status-pill.inactive {{
                color:#721c24;
                background:#f8d7da;
            }}

            .empty-state {{
                margin:0;
                padding:12px;
                border-radius:10px;
                color:#74818c;
                background:#f4f6f7;
                font-size:13px;
            }}

            @media (max-width:1100px) {{
                .modules {{
                    grid-template-columns:repeat(2, 1fr);
                }}
            }}

            @media (max-width:800px) {{
                .hero {{
                    margin-top:45px;
                }}

                .modules {{
                    grid-template-columns:1fr;
                }}

                .stats {{
                    grid-template-columns:repeat(2, 1fr);
                }}

                .overview-grid {{
                    grid-template-columns:1fr;
                }}

                .module {{
                    min-height:0;
                }}
            }}

            @media (max-width:500px) {{
                .topbar {{
                    align-items:flex-start;
                }}

                .brand small {{
                    display:none;
                }}

                .hero {{
                    margin-top:38px;
                }}

                .global-search {{
                    display:block;
                }}

                .global-search button {{
                    width:100%;
                }}

                .section-title {{
                    display:block;
                }}

                .section-title a {{
                    display:inline-block;
                    margin-top:10px;
                }}

                .responsive-table {{
                    border:0;
                    background:transparent;
                    overflow:visible;
                }}

                .responsive-table table,
                .responsive-table tbody,
                .responsive-table th,
                .responsive-table td,
                .responsive-table tr {{
                    display:block;
                    min-width:0;
                }}

                .responsive-table tr:first-child {{
                    display:none;
                }}

                .responsive-table tr {{
                    margin-bottom:12px;
                    padding:12px;
                    border:1px solid #e1e6ea;
                    border-radius:14px;
                    background:white;
                    box-shadow:0 8px 22px rgba(34,58,78,.08);
                }}

                .responsive-table td {{
                    padding:8px 0;
                    border:0;
                }}

                .responsive-table td::before {{
                    content:attr(data-label);
                    display:block;
                    margin-bottom:3px;
                    color:#7a8792;
                    font-size:12px;
                    font-weight:900;
                }}

                .table-empty {{
                    text-align:left;
                }}
            }}
        </style>
    </head>
    <body>
        <main class="page">
            <div class="home">
                <header class="topbar">
                    <div class="brand">
                        <div class="brand-mark">⌂</div>
                        <div>
                            <strong>Ahnsen hilft</strong>
                            <small>Verwaltungsübersicht</small>
                        </div>
                    </div>

                    <form method="post" action="/logout">
                        <button class="logout" type="submit">Abmelden</button>
                    </form>
                </header>

                <section class="hero">
                    <span class="eyebrow">Gemeinsam für Ahnsen</span>
                    <h1>Was möchtest du verwalten?</h1>
                    <p>
                        Alle Bereiche des Dorfassistenten an einem Ort –
                        übersichtlich, schnell und auch unterwegs gut bedienbar.
                    </p>
                </section>

                <form class="global-search" method="get" action="/">
                    <input name="suche" value="{escape(suche)}"
                           placeholder="Überall suchen: Ort, Name, Termin …">
                    <button type="submit">Suchen</button>
                </form>

                <section class="stats">
                    <div class="stat">
                        <b>{offene_meldungen}</b>
                        <span>Offene Mängel</span>
                    </div>
                    <div class="stat">
                        <b>{meldungen_in_bearbeitung}</b>
                        <span>In Bearbeitung</span>
                    </div>
                    <div class="stat">
                        <b>{offene_dgh_anfragen}</b>
                        <span>DGH-Anfragen</span>
                    </div>
                    <div class="stat">
                        <b>{kommende_veranstaltungen}</b>
                        <span>Kommende Veranstaltungen</span>
                    </div>
                </section>

                {warnung_html}
                {suchergebnisse_html}

                <section class="modules">
                    <a class="module reports" href="/dashboard">
                        <span class="module-icon">⚠</span>
                        <h2>Mängel</h2>
                        <p>Meldungen prüfen, bearbeiten und abschließen.</p>
                        <span class="open">Mängel öffnen →</span>
                    </a>

                    <a class="module events" href="/veranstaltungen">
                        <span class="module-icon">▣</span>
                        <h2>Veranstaltungen</h2>
                        <p>Termine, Bilder und Dorfveranstaltungen verwalten.</p>
                        <span class="open">Veranstaltungen öffnen →</span>
                    </a>

                    <a class="module dgh" href="/dgh">
                        <span class="module-icon">⌂</span>
                        <h2>DGH</h2>
                        <p>Anfragen, Belegungen und den Kalender verwalten.</p>
                        <span class="open">DGH öffnen →</span>
                    </a>

                    <a class="module waste" href="/muelltermine">
                        <span class="module-icon">🗑</span>
                        <h2>Müllabfuhr Termine</h2>
                        <p>Jahreskalender importieren und Abholungen prüfen.</p>
                        <span class="open">Mülltermine öffnen →</span>
                    </a>
                </section>

                <section class="overview">
                    <div class="section-title">
                        <div>
                            <span class="eyebrow">Aktueller Stand</span>
                            <h2>Zuletzt eingegangen und als Nächstes fällig</h2>
                        </div>
                    </div>

                    <div class="overview-grid">
                        <div class="overview-column">
                            <h3>⚠ Neue Mängel</h3>
                            {letzte_meldungen_html}
                        </div>
                        <div class="overview-column">
                            <h3>⌂ Offene DGH-Anfragen</h3>
                            {dgh_anfragen_html}
                        </div>
                        <div class="overview-column">
                            <h3>▣ Kommende Veranstaltungen</h3>
                            {veranstaltungen_html}
                        </div>
                    </div>
                </section>

                {abonnenten_html}
                {chatbot_verlauf_html}
            </div>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)
