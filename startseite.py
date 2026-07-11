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


def _split_liste(text):
    eintraege = []

    for zeile in str(text or "").splitlines():
        zeile = zeile.strip()
        if not zeile:
            continue

        if "|" in zeile:
            titel, beschreibung = zeile.split("|", 1)
        else:
            titel, beschreibung = zeile, ""

        eintraege.append(
            {
                "titel": titel.strip(),
                "beschreibung": beschreibung.strip(),
            }
        )

    return eintraege


def _render_public_events(veranstaltungen):
    cards = ""

    for veranstaltung in veranstaltungen[:3]:
        bild = ""
        if getattr(veranstaltung, "bild_base64", None):
            bild = (
                '<img class="event-img" alt="" '
                f'src="data:image/jpeg;base64,{veranstaltung.bild_base64}">'
            )

        cards += f"""
        <article class="event-card reveal">
            {bild}
            <div>
                <span class="chip">📅 {escape(veranstaltung.datum or "Termin")}</span>
                <h3>{escape(veranstaltung.titel or "Veranstaltung")}</h3>
                <p>
                    {escape(veranstaltung.beschreibung or "Weitere Informationen folgen.")}
                </p>
                <small>
                    {escape(veranstaltung.uhrzeit or "")}
                    {" · " if veranstaltung.uhrzeit and veranstaltung.ort else ""}
                    {escape(veranstaltung.ort or "")}
                </small>
            </div>
        </article>
        """

    if not cards:
        cards = """
        <article class="event-card reveal">
            <span class="chip">📅 Veranstaltungen</span>
            <h3>Der Veranstaltungskalender wird vorbereitet</h3>
            <p>Neue Termine erscheinen künftig automatisch an dieser Stelle.</p>
        </article>
        """

    return cards


def _render_public_news(aktuelles_text):
    cards = ""

    for eintrag in _split_liste(aktuelles_text)[:3]:
        cards += f"""
        <article class="news-card reveal">
            <span>Aktuell</span>
            <h3>{escape(eintrag["titel"])}</h3>
            <p>{escape(eintrag["beschreibung"])}</p>
        </article>
        """

    return cards


def _render_public_links(links_text):
    links = ""

    for eintrag in _split_liste(links_text):
        ziel = eintrag["beschreibung"] or "#"
        links += f"""
        <a href="{escape(ziel)}">
            <span>{escape(eintrag["titel"])}</span>
            <b>→</b>
        </a>
        """

    return links


def _render_public_list(text, fallback_icon):
    cards = ""

    for eintrag in _split_liste(text):
        cards += f"""
        <article class="mini-card reveal">
            <span class="mini-icon">{fallback_icon}</span>
            <h3>{escape(eintrag["titel"])}</h3>
            <p>{escape(eintrag["beschreibung"])}</p>
        </article>
        """

    return cards


def _render_freie_dgh_tage(freie_tage):
    if not freie_tage:
        return '<p class="muted">Freie Termine werden im Kalender angezeigt.</p>'

    tage = ""
    for tag in freie_tage[:5]:
        tage += f"<span>{tag.strftime('%d.%m.%Y')}</span>"

    return f'<div class="free-days">{tage}</div>'


def public_home_page(daten, fehler=""):
    einstellungen = daten.get("einstellungen", {})
    veranstaltungen = daten.get("veranstaltungen", [])
    freie_tage = daten.get("freie_dgh_tage", [])

    hauptfarbe = einstellungen.get("hauptfarbe", "#17324d")
    akzentfarbe = einstellungen.get("akzentfarbe", "#2f6f9f")
    gruen = einstellungen.get("gruen", "#6d8f49")
    hero_bild = einstellungen.get("hero_bild_url") or "/assets/ahnsen-startseite.png"
    whatsapp_link = einstellungen.get("whatsapp_link") or "#whatsapp"

    fehler_html = (
        f'<div class="login-error">⚠️ {escape(fehler)}</div>' if fehler else ""
    )

    events_html = _render_public_events(veranstaltungen)
    news_html = _render_public_news(einstellungen.get("aktuelles", ""))
    vereine_html = _render_public_list(einstellungen.get("vereine", ""), "🤝")
    ansprechpartner_html = _render_public_list(
        einstellungen.get("ansprechpartner", ""),
        "👤",
    )
    links_html = _render_public_links(einstellungen.get("wichtige_links", ""))
    freie_tage_html = _render_freie_dgh_tage(freie_tage)

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{escape(einstellungen.get("seiten_titel", "Ahnsen hilft"))}</title>
        <style>
            :root {{
                --navy:{hauptfarbe};
                --blue:{akzentfarbe};
                --green:{gruen};
                --ink:#172533;
                --muted:#647482;
                --soft:#f3f8f7;
                --card:#ffffff;
            }}

            * {{
                box-sizing:border-box;
            }}

            html {{
                scroll-behavior:smooth;
            }}

            body {{
                margin:0;
                font-family:Inter, "Segoe UI", Arial, sans-serif;
                color:var(--ink);
                background:
                    radial-gradient(circle at top left, rgba(47,111,159,.13), transparent 28rem),
                    linear-gradient(180deg, #f7fbfb 0%, #eef5f4 100%);
            }}

            a {{
                color:inherit;
            }}

            .site-nav {{
                position:sticky;
                top:0;
                z-index:20;
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:18px;
                padding:16px clamp(18px, 5vw, 64px);
                background:rgba(255,255,255,.82);
                border-bottom:1px solid rgba(210,222,228,.75);
                backdrop-filter:blur(18px);
            }}

            .brand {{
                display:flex;
                align-items:center;
                gap:11px;
                text-decoration:none;
                font-weight:950;
                color:var(--navy);
            }}

            .brand-mark {{
                width:42px;
                height:42px;
                display:grid;
                place-items:center;
                border-radius:15px;
                color:white;
                background:linear-gradient(135deg, var(--navy), var(--blue));
                box-shadow:0 10px 25px rgba(23,50,77,.18);
            }}

            .nav-links {{
                display:flex;
                align-items:center;
                gap:18px;
                color:#42586a;
                font-size:14px;
                font-weight:800;
            }}

            .nav-links a {{
                text-decoration:none;
            }}

            .login-pill {{
                padding:10px 14px;
                border:1px solid #d7e2e7;
                border-radius:999px;
                color:var(--navy);
                background:white;
            }}

            .section {{
                width:min(1160px, calc(100% - 36px));
                margin:0 auto;
                padding:76px 0;
            }}

            .hero {{
                width:min(1260px, calc(100% - 28px));
                min-height:720px;
                margin:20px auto 0;
                padding:clamp(18px, 4vw, 42px);
                border-radius:34px;
                background:
                    linear-gradient(115deg, rgba(10,31,49,.86) 0%, rgba(23,50,77,.62) 42%, rgba(255,255,255,.05) 100%),
                    url("{escape(hero_bild)}") center center / cover;
                box-shadow:0 30px 80px rgba(23,50,77,.24);
                overflow:hidden;
            }}

            .hero-grid {{
                min-height:630px;
                display:grid;
                grid-template-columns:minmax(0, 1.25fr) minmax(320px, .75fr);
                gap:28px;
                align-items:center;
            }}

            .hero-content {{
                color:white;
            }}

            .eyebrow,
            .chip {{
                display:inline-flex;
                align-items:center;
                gap:6px;
                width:max-content;
                padding:7px 11px;
                border-radius:999px;
                color:#163725;
                background:rgba(234,246,238,.92);
                font-size:12px;
                font-weight:950;
                letter-spacing:.04em;
                text-transform:uppercase;
            }}

            .hero h1 {{
                max-width:820px;
                margin:18px 0 12px;
                font-size:clamp(44px, 8vw, 88px);
                line-height:.96;
                letter-spacing:-.06em;
            }}

            .hero h2 {{
                max-width:760px;
                margin:0 0 18px;
                font-size:clamp(23px, 3vw, 38px);
                line-height:1.13;
                color:rgba(255,255,255,.88);
            }}

            .hero p {{
                max-width:650px;
                margin:0;
                color:rgba(255,255,255,.80);
                font-size:18px;
                line-height:1.65;
            }}

            .hero-actions {{
                display:flex;
                flex-wrap:wrap;
                gap:12px;
                margin-top:30px;
            }}

            .btn {{
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:8px;
                min-height:48px;
                padding:13px 18px;
                border:0;
                border-radius:999px;
                text-decoration:none;
                font-weight:950;
                transition:.2s ease;
            }}

            .btn:hover {{
                transform:translateY(-2px);
            }}

            .btn.primary {{
                color:white;
                background:linear-gradient(135deg, var(--green), #8db45d);
                box-shadow:0 15px 28px rgba(109,143,73,.28);
            }}

            .btn.secondary {{
                color:var(--navy);
                background:white;
            }}

            .btn.ghost {{
                color:white;
                background:rgba(255,255,255,.14);
                border:1px solid rgba(255,255,255,.34);
            }}

            .login-card {{
                align-self:center;
                padding:22px;
                border:1px solid rgba(255,255,255,.54);
                border-radius:24px;
                background:rgba(255,255,255,.90);
                box-shadow:0 22px 60px rgba(0,0,0,.20);
                backdrop-filter:blur(18px);
            }}

            .login-card h3 {{
                margin:0 0 7px;
                color:var(--navy);
                font-size:22px;
            }}

            .login-card p {{
                margin:0 0 16px;
                color:#667888;
                font-size:14px;
                line-height:1.45;
            }}

            .login-card label {{
                display:block;
                margin-bottom:10px;
                color:#314659;
                font-size:13px;
                font-weight:900;
            }}

            .login-card input {{
                width:100%;
                margin-top:5px;
                padding:12px 13px;
                border:1px solid #cfd9df;
                border-radius:12px;
                font:inherit;
            }}

            .login-card button {{
                width:100%;
                cursor:pointer;
            }}

            .login-error {{
                margin-bottom:12px;
                padding:10px 12px;
                border-radius:12px;
                color:#7d261d;
                background:#fdecea;
                font-size:13px;
                font-weight:800;
            }}

            .section-head {{
                max-width:760px;
                margin-bottom:26px;
            }}

            .section-head h2 {{
                margin:11px 0 10px;
                color:var(--navy);
                font-size:clamp(31px, 5vw, 54px);
                line-height:1.02;
                letter-spacing:-.045em;
            }}

            .section-head p {{
                margin:0;
                color:var(--muted);
                font-size:17px;
                line-height:1.65;
            }}

            .quick-grid {{
                display:grid;
                grid-template-columns:repeat(4, minmax(0, 1fr));
                gap:15px;
            }}

            .quick-card,
            .mini-card,
            .news-card,
            .event-card,
            .dgh-card,
            .whatsapp-card {{
                border:1px solid rgba(212,224,229,.8);
                border-radius:24px;
                background:rgba(255,255,255,.88);
                box-shadow:0 16px 45px rgba(34,58,78,.09);
            }}

            .quick-card {{
                min-height:155px;
                padding:20px;
                text-decoration:none;
                transition:.2s ease;
            }}

            .quick-card:hover,
            .event-card:hover {{
                transform:translateY(-5px);
                box-shadow:0 22px 55px rgba(34,58,78,.14);
            }}

            .quick-icon,
            .mini-icon {{
                width:48px;
                height:48px;
                display:grid;
                place-items:center;
                margin-bottom:15px;
                border-radius:17px;
                color:white;
                background:linear-gradient(135deg, var(--navy), var(--blue));
                font-size:24px;
            }}

            .quick-card h3,
            .mini-card h3,
            .news-card h3,
            .event-card h3 {{
                margin:0 0 8px;
                color:var(--navy);
            }}

            .quick-card p,
            .mini-card p,
            .news-card p,
            .event-card p {{
                margin:0;
                color:var(--muted);
                line-height:1.5;
            }}

            .feature-grid {{
                display:grid;
                grid-template-columns:1.05fr .95fr;
                gap:20px;
                align-items:stretch;
            }}

            .whatsapp-card {{
                padding:28px;
                color:white;
                background:
                    radial-gradient(circle at top right, rgba(255,255,255,.20), transparent 16rem),
                    linear-gradient(135deg, #0f7a47, #22b36c);
            }}

            .whatsapp-card h2,
            .whatsapp-card p {{
                color:white;
            }}

            .whatsapp-list {{
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                gap:9px;
                margin:22px 0;
                padding:0;
                list-style:none;
            }}

            .whatsapp-list li {{
                padding:10px 11px;
                border-radius:14px;
                background:rgba(255,255,255,.16);
                font-weight:800;
            }}

            .qr-box {{
                display:flex;
                align-items:center;
                gap:14px;
                padding:14px;
                border-radius:18px;
                background:rgba(255,255,255,.16);
            }}

            .qr {{
                width:86px;
                height:86px;
                display:grid;
                place-items:center;
                flex:0 0 auto;
                border-radius:18px;
                color:#0f7a47;
                background:white;
                font-size:34px;
                font-weight:950;
            }}

            .dgh-card {{
                padding:28px;
                background:linear-gradient(180deg, white, #f7fbfa);
            }}

            .free-days {{
                display:flex;
                flex-wrap:wrap;
                gap:8px;
                margin:18px 0;
            }}

            .free-days span {{
                padding:9px 11px;
                border-radius:999px;
                color:#315b2d;
                background:#e9f4e2;
                font-weight:900;
            }}

            .event-grid,
            .news-grid,
            .mini-grid {{
                display:grid;
                grid-template-columns:repeat(3, minmax(0, 1fr));
                gap:18px;
            }}

            .event-card {{
                overflow:hidden;
            }}

            .event-card > div,
            .news-card,
            .mini-card {{
                padding:20px;
            }}

            .event-img {{
                width:100%;
                height:180px;
                display:block;
                object-fit:cover;
            }}

            .event-card small {{
                display:block;
                margin-top:14px;
                color:#7b8a96;
                font-weight:800;
            }}

            .news-card span {{
                color:var(--green);
                font-size:12px;
                font-weight:950;
                text-transform:uppercase;
            }}

            .about {{
                display:grid;
                grid-template-columns:.9fr 1.1fr;
                gap:24px;
                align-items:center;
                padding:24px;
                border-radius:32px;
                background:white;
                box-shadow:0 18px 48px rgba(34,58,78,.09);
            }}

            .about-image {{
                min-height:340px;
                border-radius:26px;
                background:url("{escape(hero_bild)}") center center / cover;
            }}

            .link-list {{
                display:grid;
                grid-template-columns:repeat(2, minmax(0, 1fr));
                gap:10px;
            }}

            .link-list a {{
                display:flex;
                justify-content:space-between;
                gap:10px;
                padding:15px 16px;
                border:1px solid #dce7eb;
                border-radius:17px;
                background:white;
                text-decoration:none;
                font-weight:900;
            }}

            .footer {{
                margin-top:60px;
                padding:44px clamp(18px, 5vw, 64px);
                color:white;
                background:#10283d;
            }}

            .footer-grid {{
                width:min(1160px, 100%);
                margin:auto;
                display:grid;
                grid-template-columns:1.3fr repeat(3, 1fr);
                gap:24px;
            }}

            .footer a {{
                color:white;
                text-decoration:none;
            }}

            .muted {{
                color:var(--muted);
            }}

            .reveal {{
                animation:rise .7s ease both;
                animation-timeline:view();
                animation-range:entry 0% cover 28%;
            }}

            @keyframes rise {{
                from {{
                    opacity:.15;
                    transform:translateY(26px);
                }}
                to {{
                    opacity:1;
                    transform:translateY(0);
                }}
            }}

            @media (max-width:980px) {{
                .nav-links a:not(.login-pill) {{
                    display:none;
                }}

                .hero {{
                    min-height:0;
                }}

                .hero-grid,
                .feature-grid,
                .about,
                .footer-grid {{
                    grid-template-columns:1fr;
                }}

                .quick-grid,
                .event-grid,
                .news-grid,
                .mini-grid {{
                    grid-template-columns:repeat(2, minmax(0, 1fr));
                }}
            }}

            @media (max-width:640px) {{
                .site-nav {{
                    padding:12px 14px;
                }}

                .brand span:last-child {{
                    display:none;
                }}

                .section {{
                    width:calc(100% - 24px);
                    padding:52px 0;
                }}

                .hero {{
                    width:calc(100% - 18px);
                    margin-top:9px;
                    padding:18px;
                    border-radius:24px;
                }}

                .hero-grid {{
                    min-height:0;
                }}

                .hero h1 {{
                    font-size:44px;
                }}

                .hero-actions,
                .whatsapp-list,
                .quick-grid,
                .event-grid,
                .news-grid,
                .mini-grid,
                .link-list {{
                    grid-template-columns:1fr;
                }}

                .btn {{
                    width:100%;
                }}

                .qr-box {{
                    align-items:flex-start;
                }}
            }}
        </style>
    </head>
    <body>
        <nav class="site-nav">
            <a class="brand" href="/">
                <span class="brand-mark">⌂</span>
                <span>{escape(einstellungen.get("logo_text", "Ahnsen hilft"))}</span>
            </a>
            <div class="nav-links">
                <a href="#whatsapp">WhatsApp</a>
                <a href="#dgh">DGH</a>
                <a href="#veranstaltungen">Veranstaltungen</a>
                <a href="#buergerinfo">Bürgerinfo</a>
                <a class="login-pill" href="#login">Login</a>
            </div>
        </nav>

        <header class="hero">
            <div class="hero-grid">
                <div class="hero-content">
                    <span class="eyebrow">Gemeinsam digital für Ahnsen</span>
                    <h1>{escape(einstellungen.get("hero_titel", "Willkommen in Ahnsen"))}</h1>
                    <h2>{escape(einstellungen.get("hero_untertitel", ""))}</h2>
                    <p>{escape(einstellungen.get("hero_text", ""))}</p>
                    <div class="hero-actions">
                        <a class="btn primary" href="{escape(whatsapp_link)}">⚠️ Mangel melden</a>
                        <a class="btn secondary" href="#veranstaltungen">📅 Veranstaltungen ansehen</a>
                        <a class="btn ghost" href="#dgh">🏛️ DGH buchen</a>
                    </div>
                </div>

                <aside class="login-card" id="login">
                    <h3>Interner Bereich</h3>
                    <p>Für Verwaltung, Redaktion und Gemeindeteam.</p>
                    {fehler_html}
                    <form method="post" action="/login">
                        <label>Benutzername
                            <input name="username" autocomplete="username" required>
                        </label>
                        <label>Passwort
                            <input name="password" type="password"
                                   autocomplete="current-password" required>
                        </label>
                        <button class="btn primary" type="submit">
                            Sicher anmelden
                        </button>
                    </form>
                </aside>
            </div>
        </header>

        <main>
            <section class="section" id="schnellzugriff">
                <div class="section-head reveal">
                    <span class="eyebrow">Schnelleinstieg</span>
                    <h2>Alles Wichtige direkt erreichbar.</h2>
                    <p>{escape(einstellungen.get("willkommen_text", ""))}</p>
                </div>

                <div class="quick-grid">
                    <a class="quick-card reveal" href="{escape(whatsapp_link)}">
                        <span class="quick-icon">⚠️</span>
                        <h3>Mängel melden</h3>
                        <p>Schäden und Hinweise unkompliziert per WhatsApp senden.</p>
                    </a>
                    <a class="quick-card reveal" href="#veranstaltungen">
                        <span class="quick-icon">📅</span>
                        <h3>Veranstaltungen</h3>
                        <p>Die nächsten Termine und Aktionen im Dorf.</p>
                    </a>
                    <a class="quick-card reveal" href="#dgh">
                        <span class="quick-icon">🏛️</span>
                        <h3>DGH</h3>
                        <p>Dorfgemeinschaftshaus prüfen und Anfrage starten.</p>
                    </a>
                    <a class="quick-card reveal" href="#whatsapp">
                        <span class="quick-icon">💬</span>
                        <h3>WhatsApp</h3>
                        <p>Der direkte digitale Dorfassistent für Ahnsen.</p>
                    </a>
                    <a class="quick-card reveal" href="#buergerinfo">
                        <span class="quick-icon">🗑️</span>
                        <h3>Mülltermine</h3>
                        <p>Abholungen und Erinnerungen rechtzeitig erhalten.</p>
                    </a>
                    <a class="quick-card reveal" href="#ansprechpartner">
                        <span class="quick-icon">☎️</span>
                        <h3>Ansprechpartner</h3>
                        <p>Die richtigen Kontakte schnell finden.</p>
                    </a>
                    <a class="quick-card reveal" href="#vereine">
                        <span class="quick-icon">🤝</span>
                        <h3>Vereine</h3>
                        <p>Gemeinschaft, Ehrenamt und Angebote vor Ort.</p>
                    </a>
                    <a class="quick-card reveal" href="#ueber-ahnsen">
                        <span class="quick-icon">🌳</span>
                        <h3>Über Ahnsen</h3>
                        <p>Ein kurzer Blick auf Dorf, Lage und Gemeinschaft.</p>
                    </a>
                </div>
            </section>

            <section class="section" id="whatsapp">
                <div class="feature-grid">
                    <article class="whatsapp-card reveal">
                        <span class="eyebrow">WhatsApp-Bot</span>
                        <h2>Der Dorfassistent direkt in der Hosentasche.</h2>
                        <p>{escape(einstellungen.get("whatsapp_text", ""))}</p>
                        <ul class="whatsapp-list">
                            <li>⚠️ Mängel melden</li>
                            <li>📅 Veranstaltungen abrufen</li>
                            <li>☎️ Ansprechpartner finden</li>
                            <li>🗑️ Mülltermine ansehen</li>
                            <li>🏛️ DGH buchen</li>
                            <li>🔔 Benachrichtigungen erhalten</li>
                        </ul>
                        <a class="btn secondary" href="{escape(whatsapp_link)}">
                            WhatsApp öffnen
                        </a>
                    </article>

                    <article class="dgh-card reveal" id="dgh">
                        <span class="chip">🏛️ Dorfgemeinschaftshaus</span>
                        <h2>DGH buchen</h2>
                        <p>
                            Prüfe den Kalender und starte eine Anfrage für deinen
                            Termin im Dorfgemeinschaftshaus.
                        </p>
                        <h3>Nächste freie Termine</h3>
                        {freie_tage_html}
                        <a class="btn primary" href="{escape(whatsapp_link)}">
                            Jetzt buchen
                        </a>
                    </article>
                </div>
            </section>

            <section class="section" id="veranstaltungen">
                <div class="section-head reveal">
                    <span class="eyebrow">Dorfleben</span>
                    <h2>Nächste Veranstaltungen</h2>
                    <p>Aktuelle Termine aus Ahnsen erscheinen automatisch hier.</p>
                </div>
                <div class="event-grid">{events_html}</div>
            </section>

            <section class="section" id="aktuelles">
                <div class="section-head reveal">
                    <span class="eyebrow">Neuigkeiten</span>
                    <h2>Aktuelles aus der Gemeinde</h2>
                    <p>Kurze Hinweise, wichtige Informationen und Neuigkeiten.</p>
                </div>
                <div class="news-grid">{news_html}</div>
            </section>

            <section class="section" id="ueber-ahnsen">
                <article class="about reveal">
                    <div class="about-image"></div>
                    <div>
                        <span class="eyebrow">Über Ahnsen</span>
                        <h2>Modern verbunden, dörflich verwurzelt.</h2>
                        <p>{escape(einstellungen.get("ueber_ahnsen_text", ""))}</p>
                    </div>
                </article>
            </section>

            <section class="section" id="buergerinfo">
                <div class="section-head reveal">
                    <span class="eyebrow">Bürgerinformation</span>
                    <h2>Wichtige Links</h2>
                    <p>Die wichtigsten Informationen und Anlaufstellen kompakt gesammelt.</p>
                </div>
                <div class="link-list reveal">{links_html}</div>
            </section>

            <section class="section" id="vereine">
                <div class="section-head reveal">
                    <span class="eyebrow">Gemeinschaft</span>
                    <h2>Vereine in Ahnsen</h2>
                    <p>Vereine und ehrenamtliche Gruppen prägen das Leben vor Ort.</p>
                </div>
                <div class="mini-grid">{vereine_html}</div>
            </section>

            <section class="section" id="ansprechpartner">
                <div class="section-head reveal">
                    <span class="eyebrow">Kontakt</span>
                    <h2>Ansprechpartner</h2>
                    <p>Die wichtigsten Kontakte für Bürgerinnen und Bürger.</p>
                </div>
                <div class="mini-grid">{ansprechpartner_html}</div>
            </section>
        </main>

        <footer class="footer" id="footer">
            <div class="footer-grid">
                <div>
                    <h2>{escape(einstellungen.get("logo_text", "Ahnsen hilft"))}</h2>
                    <p>{escape(einstellungen.get("hero_untertitel", ""))}</p>
                </div>
                <div>
                    <h3>Kontakt</h3>
                    <p>
                        {escape(einstellungen.get("kontakt_name", ""))}<br>
                        {escape(einstellungen.get("kontakt_adresse", ""))}<br>
                        {escape(einstellungen.get("kontakt_email", ""))}<br>
                        {escape(einstellungen.get("kontakt_telefon", ""))}
                    </p>
                </div>
                <div>
                    <h3>Öffnungszeiten</h3>
                    <p>{escape(einstellungen.get("oeffnungszeiten", ""))}</p>
                </div>
                <div>
                    <h3>Rechtliches</h3>
                    <p>
                        <a href="{escape(einstellungen.get("footer_impressum_url", "#"))}">Impressum</a><br>
                        <a href="{escape(einstellungen.get("footer_datenschutz_url", "#"))}">Datenschutz</a>
                    </p>
                </div>
            </div>
        </footer>
    </body>
    </html>
    """

    return HTMLResponse(html)


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

            .settings .module-icon {{
                background:linear-gradient(135deg, #17324d, #2f6f9f);
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

                    <a class="module settings" href="/gemeindeseite">
                        <span class="module-icon">🎨</span>
                        <h2>Gemeindeseite bearbeiten</h2>
                        <p>Texte, Farben, Kontakt, Links und Homepage-Inhalte pflegen.</p>
                        <span class="open">Homepage bearbeiten →</span>
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
