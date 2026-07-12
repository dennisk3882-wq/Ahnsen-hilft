from html import escape


def intern_nav(active=""):
    eintraege = [
        ("start", "/", "⌂", "Start"),
        ("maengel", "/intern/maengel", "⚠", "Mängel"),
        ("veranstaltungen", "/intern/veranstaltungen", "📅", "Veranstaltungen"),
        ("dgh", "/intern/dgh", "⌂", "DGH"),
        ("muell", "/intern/muelltermine", "🗑", "Müllabfuhr Termine"),
        ("gemeindeseite", "/intern/gemeindeseite", "🎨", "Gemeindeseite"),
    ]

    links = ""
    for key, href, icon, label in eintraege:
        klasse = "active" if key == active else ""
        links += f"""
        <a class="{klasse}" href="{escape(href)}">
            <span>{escape(icon)}</span>
            {escape(label)}
        </a>
        """

    return f"""
    <nav class="internal-nav" aria-label="Interne Navigation">
        <a class="internal-brand" href="/">
            <span class="internal-brand-mark">AH</span>
            <strong>Ahnsen hilft</strong>
            <small>Interner Bereich</small>
        </a>
        <div class="internal-nav-links">
            {links}
        </div>
        <form method="post" action="/logout">
            <button type="submit">Abmelden</button>
        </form>
    </nav>
    """


def intern_nav_css():
    return """
    .internal-nav {
        position:sticky;
        top:14px;
        z-index:50;
        display:flex;
        align-items:center;
        gap:14px;
        margin:0 0 24px;
        padding:12px;
        border:1px solid rgba(209,222,229,.86);
        border-radius:24px;
        background:rgba(255,255,255,.92);
        box-shadow:0 18px 45px rgba(34,58,78,.12);
        backdrop-filter:blur(16px);
    }

    .internal-brand {
        display:flex;
        align-items:center;
        gap:10px;
        min-width:max-content;
        color:#17324d;
        text-decoration:none;
    }

    .internal-brand-mark {
        width:42px;
        height:42px;
        display:grid;
        place-items:center;
        border-radius:15px;
        color:white;
        background:linear-gradient(135deg, #17324d, #2f6f9f);
        font-size:13px;
        font-weight:950;
        letter-spacing:.04em;
    }

    .internal-brand strong,
    .internal-brand small {
        display:block;
        line-height:1.1;
    }

    .internal-brand small {
        margin-top:3px;
        color:#74818c;
        font-size:12px;
        font-weight:800;
    }

    .internal-nav-links {
        display:flex;
        flex:1;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
    }

    .internal-nav a:not(.internal-brand),
    .internal-nav button {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        min-height:40px;
        padding:9px 12px;
        border:1px solid #d7e2e7;
        border-radius:999px;
        color:#314a5e;
        background:#f8fbfc;
        text-decoration:none;
        font:inherit;
        font-size:14px;
        font-weight:900;
        cursor:pointer;
        transition:.18s ease;
    }

    .internal-nav a:not(.internal-brand):hover,
    .internal-nav button:hover,
    .internal-nav a.active {
        color:white;
        border-color:#17324d;
        background:linear-gradient(135deg, #17324d, #2f6f9f);
        transform:translateY(-1px);
        box-shadow:0 10px 22px rgba(23,50,77,.16);
    }

    .internal-nav form {
        margin:0;
    }

    @media (max-width:900px) {
        .internal-nav {
            position:static;
            align-items:stretch;
            display:grid;
        }

        .internal-nav-links {
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
        }

        .internal-nav a:not(.internal-brand),
        .internal-nav button {
            width:100%;
        }
    }

    @media (max-width:560px) {
        .internal-nav-links {
            grid-template-columns:1fr;
        }
    }
    """
