from html import escape

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
                    Melde dich an, um Meldungen, Veranstaltungen und
                    DGH-Buchungen zu verwalten.
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


def start_page():
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

            .modules {{
                display:grid;
                grid-template-columns:repeat(3, 1fr);
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

            @media (max-width:800px) {{
                .hero {{
                    margin-top:45px;
                }}

                .modules {{
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
                </section>
            </div>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)
