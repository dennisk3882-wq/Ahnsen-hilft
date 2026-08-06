from html import escape


_ICONS = {
    "maengel": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>""",
    "veranstaltungen": """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/><path d="M7 14h3m4 0h3m-10 4h3"/></svg>""",
    "dgh": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>""",
    "muell": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14"/><path d="M10 11v6m4-6v6"/></svg>""",
    "gemeindeseite": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2m4 0h10M4 18h7m4 0h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>""",
    "app": """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 5h6m-4 14h2"/></svg>""",
    "logout": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9"/></svg>""",
}


def _icon(name: str) -> str:
    return _ICONS.get(name, _ICONS["app"])


def _crest() -> str:
    return """
    <span class="internal-brand-crest" aria-hidden="true">
      <svg viewBox="0 0 64 72">
        <path class="crest-shape" d="M7 5h50v34c0 16-12 24-25 29C19 63 7 55 7 39z"/>
        <path class="crest-hill" d="M8 45c11-10 22-8 28-3 7-7 13-8 20-3v4c0 13-10 20-24 25C18 63 8 56 8 43z"/>
        <path class="crest-house" d="m20 42 12-10 12 10v14H20z"/>
        <path class="crest-roof" d="m17 43 15-13 15 13"/>
        <path class="crest-door" d="M29 47h6v9h-6z"/>
        <path class="crest-tree" d="M47 20v21M42 25l5-7 5 7M41 32l6-8 6 8"/>
        <path class="crest-tower" d="M19 20h8v18h-8zM18 20l5-8 5 8"/>
      </svg>
    </span>
    """


def intern_nav(active=""):
    if active == "start":
        active = "maengel"

    eintraege = [
        ("maengel", "/intern/maengel", "Mängel"),
        ("veranstaltungen", "/intern/veranstaltungen", "Termine"),
        ("dgh", "/intern/dgh", "DGH"),
        ("muell", "/intern/muelltermine", "Müllabfuhr"),
        ("gemeindeseite", "/intern/gemeindeseite", "Inhalte"),
    ]

    links = []
    mobile_links = []
    for key, href, label in eintraege:
        klasse = " active" if key == active else ""
        current = ' aria-current="page"' if key == active else ""
        links.append(
            f'<a class="internal-nav-link{klasse}" href="{escape(href)}"{current}>'
            f'<span class="internal-nav-icon">{_icon(key)}</span>'
            f'<span>{escape(label)}</span></a>'
        )
        mobile_links.append(
            f'<a class="internal-mobile-link{klasse}" href="{escape(href)}"{current}>'
            f'<span>{_icon(key)}</span><small>{escape(label)}</small></a>'
        )

    return f"""
    <header class="internal-nav">
        <a class="internal-brand" href="/intern/maengel" aria-label="Ahnsen hilft Verwaltung">
            {_crest()}
            <span class="internal-brand-copy">
                <span><strong>Ahnsen</strong><em>hilft</em></span>
                <small>Verwaltungsbereich</small>
            </span>
        </a>

        <nav class="internal-nav-links" aria-label="Verwaltungsnavigation">
            {''.join(links)}
        </nav>

        <div class="internal-nav-actions">
            <a class="internal-preview-link" href="/" target="_blank" rel="noopener">
                <span>{_icon('app')}</span><span>Bürger-App</span>
            </a>
            <form method="post" action="/logout">
                <button class="internal-logout" type="submit" title="Abmelden">
                    <span>{_icon('logout')}</span><span>Abmelden</span>
                </button>
            </form>
        </div>
    </header>

    <nav class="internal-mobile-nav" aria-label="Mobile Verwaltungsnavigation">
        {''.join(mobile_links)}
    </nav>
    """


def intern_nav_css():
    return """
    :root {
        --admin-forest:#174936;
        --admin-forest-deep:#0f3528;
        --admin-green:#287052;
        --admin-sage:#8da77a;
        --admin-sage-soft:#eaf1e5;
        --admin-cream:#fbf8ef;
        --admin-paper:#fffefa;
        --admin-ink:#17221d;
        --admin-muted:#6e786f;
        --admin-line:#dfe7dc;
        --admin-warning:#c78a1b;
        --admin-danger:#b64a42;
        --admin-shadow:0 22px 60px rgba(30,66,50,.11);
        --admin-shadow-soft:0 12px 34px rgba(30,66,50,.08);
    }

    *, *::before, *::after { box-sizing:border-box; }

    html {
        min-height:100%;
        background:var(--admin-cream);
    }

    body {
        min-height:100vh !important;
        margin:0 !important;
        padding:20px !important;
        padding-bottom:36px !important;
        color:var(--admin-ink) !important;
        background:
            radial-gradient(circle at 8% 3%, rgba(141,167,122,.17), transparent 28rem),
            radial-gradient(circle at 96% 12%, rgba(23,73,54,.08), transparent 31rem),
            linear-gradient(180deg, #fbfaf3 0%, #f5f7ef 100%) !important;
        font-family:Inter, "Segoe UI", Arial, sans-serif !important;
        -webkit-font-smoothing:antialiased;
    }

    body::before {
        content:"";
        position:fixed;
        inset:0;
        pointer-events:none;
        opacity:.25;
        background-image:radial-gradient(rgba(23,73,54,.12) .7px, transparent .7px);
        background-size:18px 18px;
        mask-image:linear-gradient(to bottom, #000, transparent 70%);
    }

    .container,
    .wrap,
    .admin-page {
        position:relative;
        z-index:1;
        width:min(100%, 1480px) !important;
        max-width:1480px !important;
        margin:0 auto !important;
    }

    h1, h2, h3, h4 {
        color:var(--admin-ink) !important;
        letter-spacing:-.025em;
    }

    h1 {
        font-family:Georgia, "Times New Roman", serif !important;
        font-size:clamp(32px, 5vw, 56px) !important;
        line-height:1.02 !important;
    }

    h2 { font-size:clamp(22px, 3vw, 30px) !important; }

    a { color:var(--admin-forest); }

    .internal-nav {
        position:sticky !important;
        top:14px !important;
        z-index:100 !important;
        display:grid !important;
        grid-template-columns:auto minmax(0,1fr) auto !important;
        align-items:center !important;
        gap:18px !important;
        width:min(100%, 1480px) !important;
        margin:0 auto 26px !important;
        padding:11px 12px !important;
        border:1px solid rgba(210,222,208,.9) !important;
        border-radius:25px !important;
        background:rgba(255,254,250,.94) !important;
        box-shadow:0 18px 55px rgba(30,66,50,.14) !important;
        backdrop-filter:blur(20px) saturate(1.2);
    }

    .internal-brand {
        display:flex !important;
        align-items:center !important;
        gap:11px !important;
        min-width:max-content !important;
        color:var(--admin-forest) !important;
        text-decoration:none !important;
    }

    .internal-brand-crest {
        width:48px;
        height:54px;
        display:block;
        flex:0 0 auto;
    }

    .internal-brand-crest svg { width:100%; height:100%; overflow:visible; }
    .internal-brand-crest .crest-shape { fill:#f4efdd; stroke:var(--admin-forest); stroke-width:2.4; }
    .internal-brand-crest .crest-hill { fill:#8fa779; }
    .internal-brand-crest .crest-house { fill:#f7f1de; stroke:var(--admin-forest); stroke-width:2; }
    .internal-brand-crest .crest-roof,
    .internal-brand-crest .crest-tree,
    .internal-brand-crest .crest-tower { fill:none; stroke:var(--admin-forest); stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
    .internal-brand-crest .crest-door { fill:var(--admin-forest); }

    .internal-brand-copy { display:grid; gap:1px; }
    .internal-brand-copy > span { display:flex; align-items:baseline; gap:8px; }
    .internal-brand-copy strong {
        font-family:Georgia, "Times New Roman", serif;
        font-size:24px;
        font-weight:500;
        line-height:1;
    }
    .internal-brand-copy em {
        color:var(--admin-sage);
        font-family:Georgia, "Times New Roman", serif;
        font-size:17px;
        font-weight:500;
    }
    .internal-brand-copy small {
        color:var(--admin-muted);
        font-size:11px;
        font-weight:800;
        letter-spacing:.09em;
        text-transform:uppercase;
    }

    .internal-nav-links {
        display:flex !important;
        min-width:0 !important;
        align-items:center !important;
        justify-content:center !important;
        gap:6px !important;
    }

    .internal-nav-link,
    .internal-preview-link,
    .internal-logout {
        min-height:44px !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:8px !important;
        padding:9px 12px !important;
        border:1px solid transparent !important;
        border-radius:15px !important;
        color:#526057 !important;
        background:transparent !important;
        box-shadow:none !important;
        font:inherit !important;
        font-size:13px !important;
        font-weight:850 !important;
        line-height:1 !important;
        text-decoration:none !important;
        white-space:nowrap !important;
        cursor:pointer !important;
        transition:transform .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease !important;
    }

    .internal-nav-icon,
    .internal-preview-link > span:first-child,
    .internal-logout > span:first-child {
        width:20px;
        height:20px;
        display:grid;
        place-items:center;
    }

    .internal-nav svg,
    .internal-mobile-nav svg {
        width:20px;
        height:20px;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round;
    }

    .internal-nav-link:hover,
    .internal-nav-link.active {
        color:var(--admin-forest) !important;
        background:var(--admin-sage-soft) !important;
        transform:translateY(-1px) !important;
    }

    .internal-nav-link.active {
        box-shadow:inset 0 0 0 1px rgba(23,73,54,.08) !important;
    }

    .internal-nav-actions {
        display:flex !important;
        align-items:center !important;
        gap:6px !important;
    }

    .internal-nav-actions form { margin:0 !important; }

    .internal-preview-link {
        color:var(--admin-forest) !important;
        border-color:var(--admin-line) !important;
        background:#f8faf5 !important;
    }

    .internal-logout {
        color:white !important;
        background:var(--admin-forest) !important;
        margin:0 !important;
    }

    .internal-preview-link:hover,
    .internal-logout:hover {
        transform:translateY(-1px) !important;
        box-shadow:0 10px 22px rgba(23,73,54,.15) !important;
    }

    .internal-mobile-nav { display:none; }

    .admin-hero,
    .hero {
        position:relative !important;
        overflow:hidden !important;
        margin:0 0 22px !important;
        padding:clamp(24px, 4vw, 42px) !important;
        border:1px solid rgba(255,255,255,.28) !important;
        border-radius:30px !important;
        color:white !important;
        background:
            linear-gradient(115deg, rgba(13,55,40,.98), rgba(35,103,73,.92)),
            radial-gradient(circle at 88% 20%, rgba(185,207,160,.55), transparent 18rem) !important;
        box-shadow:var(--admin-shadow) !important;
    }

    .admin-hero::after,
    .hero::after {
        content:"";
        position:absolute;
        width:330px;
        height:330px;
        right:-80px;
        bottom:-180px;
        border:1px solid rgba(255,255,255,.18);
        border-radius:50%;
        box-shadow:0 0 0 45px rgba(255,255,255,.04), 0 0 0 90px rgba(255,255,255,.025);
    }

    .admin-hero > *, .hero > * { position:relative; z-index:1; }
    .admin-hero h1, .admin-hero h2, .hero h1, .hero h2 { color:white !important; margin:0 0 10px !important; }
    .admin-hero p, .hero p { max-width:780px !important; margin:0 !important; color:rgba(255,255,255,.82) !important; line-height:1.55 !important; }

    .admin-eyebrow {
        display:inline-flex;
        align-items:center;
        gap:8px;
        margin-bottom:11px;
        color:#d9e8cf;
        font-size:12px;
        font-weight:900;
        letter-spacing:.14em;
        text-transform:uppercase;
    }

    .admin-hero-actions {
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-top:22px;
    }

    .admin-hero-actions a {
        display:inline-flex;
        align-items:center;
        min-height:44px;
        padding:10px 15px;
        border:1px solid rgba(255,255,255,.28);
        border-radius:999px;
        color:white !important;
        background:rgba(255,255,255,.1);
        text-decoration:none;
        font-weight:850;
        backdrop-filter:blur(8px);
    }

    .box,
    .card,
    .section,
    .content-card,
    .calendar-year,
    .booking-detail,
    .status-result,
    .table-wrap {
        border:1px solid var(--admin-line) !important;
        border-radius:24px !important;
        background:rgba(255,254,250,.94) !important;
        box-shadow:var(--admin-shadow-soft) !important;
    }

    .box,
    .section,
    .content-card,
    .calendar-year {
        padding:22px !important;
        margin-bottom:20px !important;
    }

    .cards,
    .admin-stat-grid {
        display:grid !important;
        grid-template-columns:repeat(4, minmax(0,1fr)) !important;
        gap:14px !important;
        margin:0 0 20px !important;
    }

    .card,
    .admin-stat-card {
        position:relative;
        overflow:hidden;
        min-height:132px;
        padding:20px !important;
    }

    .card::after,
    .admin-stat-card::after {
        content:"";
        position:absolute;
        width:85px;
        height:85px;
        right:-34px;
        bottom:-34px;
        border-radius:50%;
        background:var(--admin-sage-soft);
    }

    .card b,
    .admin-stat-card strong {
        display:block !important;
        margin:7px 0 3px !important;
        color:var(--admin-forest) !important;
        font-family:Georgia, "Times New Roman", serif !important;
        font-size:38px !important;
        font-weight:600 !important;
        line-height:1 !important;
    }

    .admin-stat-label,
    .card small {
        color:var(--admin-muted);
        font-size:13px;
        font-weight:800;
    }

    .admin-stat-icon {
        width:38px;
        height:38px;
        display:grid;
        place-items:center;
        border-radius:13px;
        color:var(--admin-forest);
        background:var(--admin-sage-soft);
    }

    .admin-stat-icon svg { width:21px; height:21px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }

    input,
    textarea,
    select {
        width:100% !important;
        min-height:46px !important;
        padding:11px 13px !important;
        border:1px solid #ccd8ca !important;
        border-radius:14px !important;
        color:var(--admin-ink) !important;
        background:#fffefa !important;
        box-shadow:inset 0 1px 0 rgba(23,73,54,.03) !important;
        font:inherit !important;
        font-size:15px !important;
        outline:none !important;
        transition:border-color .18s ease, box-shadow .18s ease !important;
    }

    textarea { min-height:120px !important; resize:vertical !important; }

    input:focus,
    textarea:focus,
    select:focus {
        border-color:var(--admin-green) !important;
        box-shadow:0 0 0 4px rgba(40,112,82,.12) !important;
    }

    input[type="file"] { padding:10px !important; }

    button,
    .link-button,
    .cancel,
    .secondary,
    .edit-link {
        width:auto !important;
        min-height:42px !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:7px !important;
        margin:3px !important;
        padding:9px 14px !important;
        border:1px solid transparent !important;
        border-radius:13px !important;
        color:white !important;
        background:var(--admin-green) !important;
        box-shadow:none !important;
        font:inherit !important;
        font-size:13px !important;
        font-weight:850 !important;
        line-height:1.15 !important;
        text-decoration:none !important;
        cursor:pointer !important;
        transition:transform .18s ease, box-shadow .18s ease, background .18s ease !important;
    }

    button:hover,
    .link-button:hover,
    .cancel:hover,
    .secondary:hover,
    .edit-link:hover {
        background:var(--admin-forest) !important;
        transform:translateY(-1px) !important;
        box-shadow:0 9px 20px rgba(23,73,54,.15) !important;
    }

    .secondary,
    .cancel,
    .link-button {
        color:var(--admin-forest) !important;
        border-color:var(--admin-line) !important;
        background:#f5f8f2 !important;
    }

    .danger,
    button.danger {
        color:white !important;
        background:var(--admin-danger) !important;
    }

    .active-filter {
        color:white !important;
        border-color:var(--admin-forest) !important;
        background:var(--admin-forest) !important;
        box-shadow:0 8px 18px rgba(23,73,54,.16) !important;
    }

    .message,
    .form-alert {
        padding:14px 17px !important;
        border:1px solid #cfe2c8 !important;
        border-radius:16px !important;
        color:#24533d !important;
        background:#edf6e8 !important;
        box-shadow:var(--admin-shadow-soft) !important;
        font-weight:800 !important;
    }

    .message.error,
    .form-alert.error {
        color:#8d3934 !important;
        border-color:#efc9c5 !important;
        background:#fff0ee !important;
    }

    .table-wrap {
        overflow:hidden !important;
        padding:0 !important;
    }

    table {
        width:100% !important;
        border-collapse:separate !important;
        border-spacing:0 !important;
        background:transparent !important;
    }

    thead, th {
        color:#445248 !important;
        background:#f0f4ec !important;
    }

    th {
        padding:14px 13px !important;
        border-bottom:1px solid var(--admin-line) !important;
        font-size:11px !important;
        font-weight:900 !important;
        letter-spacing:.08em !important;
        text-align:left !important;
        text-transform:uppercase !important;
        white-space:nowrap !important;
    }

    td {
        padding:14px 13px !important;
        border-bottom:1px solid #e8eee5 !important;
        color:#38433c !important;
        background:transparent !important;
        vertical-align:top !important;
        line-height:1.45 !important;
    }

    tr:nth-child(even), tr:hover { background:transparent !important; }
    tbody tr { transition:background .16s ease; }
    tbody tr:hover { background:#f7faf4 !important; }
    tbody tr:last-child td { border-bottom:0 !important; }

    .status,
    .status-badge,
    .holiday,
    .regular {
        display:inline-flex !important;
        align-items:center !important;
        min-height:30px !important;
        padding:5px 10px !important;
        border-radius:999px !important;
        font-size:12px !important;
        font-weight:900 !important;
        white-space:nowrap !important;
    }

    .status-anfrage { color:#845b12 !important; background:#fff2c9 !important; }
    .status-bestaetigt { color:#1d603f !important; background:#dff1e5 !important; }
    .status-abgelehnt { color:#913c36 !important; background:#fae2df !important; }
    .status-inaktiv { color:#667169 !important; background:#edf0ec !important; }

    .event-img,
    .foto {
        border:1px solid var(--admin-line) !important;
        border-radius:16px !important;
        box-shadow:0 10px 24px rgba(23,73,54,.12) !important;
    }

    .upload-area,
    .upload-card,
    .import-card {
        border:1.5px dashed #b8cbb3 !important;
        border-radius:18px !important;
        background:#f7faf4 !important;
    }

    .upload-area button { width:100% !important; margin:13px 0 0 !important; }

    .calendar-day {
        border-radius:10px !important;
        font-weight:800 !important;
    }
    .calendar-day.frei { color:#376049 !important; background:#eef5e9 !important; }
    .calendar-day.angefragt { color:#8a6115 !important; background:#fff1c7 !important; }
    .calendar-day.bestaetigt { color:white !important; background:var(--admin-green) !important; }
    .calendar-day.today { box-shadow:inset 0 0 0 2px var(--admin-forest) !important; }

    .muted,
    .subtitle,
    .hint,
    .help,
    .empty { color:var(--admin-muted) !important; }

    .admin-toolbar {
        display:grid;
        grid-template-columns:minmax(220px, 1fr) auto;
        gap:14px;
        align-items:end;
    }

    .admin-filter-groups {
        display:flex;
        flex-wrap:wrap;
        gap:16px;
        align-items:flex-end;
    }

    .admin-filter-group { display:grid; gap:7px; }
    .admin-filter-group > span {
        color:var(--admin-muted);
        font-size:11px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
    }

    .admin-filter-row { display:flex; flex-wrap:wrap; gap:6px; }
    .admin-table-desktop { display:block; }
    .admin-mobile-list { display:none; }

    .admin-mobile-card {
        padding:18px;
        border:1px solid var(--admin-line);
        border-radius:20px;
        background:var(--admin-paper);
        box-shadow:var(--admin-shadow-soft);
    }

    .admin-mobile-card + .admin-mobile-card { margin-top:12px; }

    @media (max-width:1180px) {
        .internal-nav {
            grid-template-columns:auto 1fr !important;
        }
        .internal-nav-links {
            grid-column:1 / -1;
            order:3;
            justify-content:flex-start !important;
            overflow-x:auto;
            padding-top:4px;
            scrollbar-width:none;
        }
        .internal-nav-links::-webkit-scrollbar { display:none; }
        .internal-nav-actions { justify-self:end; }
    }

    @media (max-width:820px) {
        body {
            padding:10px !important;
            padding-bottom:98px !important;
        }

        .internal-nav {
            position:sticky !important;
            top:8px !important;
            grid-template-columns:1fr auto !important;
            gap:8px !important;
            margin-bottom:16px !important;
            padding:9px 10px !important;
            border-radius:21px !important;
        }

        .internal-brand-crest { width:42px; height:47px; }
        .internal-brand-copy strong { font-size:22px; }
        .internal-brand-copy em { font-size:15px; }
        .internal-brand-copy small { font-size:9px; }
        .internal-nav-links { display:none !important; }
        .internal-preview-link span:last-child,
        .internal-logout span:last-child { display:none; }
        .internal-preview-link,
        .internal-logout { width:42px !important; height:42px !important; padding:0 !important; border-radius:14px !important; }

        .internal-mobile-nav {
            position:fixed;
            z-index:120;
            left:10px;
            right:10px;
            bottom:max(10px, env(safe-area-inset-bottom));
            display:grid;
            grid-template-columns:repeat(5, minmax(0,1fr));
            gap:4px;
            padding:7px;
            border:1px solid rgba(210,222,208,.92);
            border-radius:23px;
            background:rgba(255,254,250,.96);
            box-shadow:0 18px 48px rgba(23,73,54,.2);
            backdrop-filter:blur(20px);
        }

        .internal-mobile-link {
            min-width:0;
            min-height:58px;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:4px;
            border-radius:16px;
            color:#69736b;
            text-decoration:none;
        }

        .internal-mobile-link > span { width:22px; height:22px; display:grid; place-items:center; }
        .internal-mobile-link small { max-width:100%; overflow:hidden; font-size:9px; font-weight:850; text-overflow:ellipsis; white-space:nowrap; }
        .internal-mobile-link.active { color:var(--admin-forest); background:var(--admin-sage-soft); }

        .cards,
        .admin-stat-grid {
            grid-template-columns:repeat(2, minmax(0,1fr)) !important;
        }

        .admin-toolbar { grid-template-columns:1fr; }
        .admin-filter-groups { display:grid; gap:12px; }
        .admin-table-desktop { display:none; }
        .admin-mobile-list { display:block; }

        .box,
        .section,
        .content-card,
        .calendar-year { padding:17px !important; border-radius:20px !important; }

        .admin-hero,
        .hero { padding:25px 20px !important; border-radius:24px !important; }

        .grid { grid-template-columns:1fr !important; }
        .next-content { align-items:flex-start !important; flex-direction:column !important; }
    }

    @media (max-width:520px) {
        .cards,
        .admin-stat-grid { gap:9px !important; }
        .card,
        .admin-stat-card { min-height:116px; padding:15px !important; }
        .card b,
        .admin-stat-card strong { font-size:32px !important; }
        .internal-brand-copy small { display:none; }
        .internal-nav-actions { gap:4px !important; }
        .internal-preview-link { display:none !important; }
    }
    """
