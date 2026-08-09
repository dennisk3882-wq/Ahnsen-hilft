from pathlib import Path


# community_routes.py: wire the official council information service into the public page/API.
path = Path("community_routes.py")
text = path.read_text(encoding="utf-8")
if "from ratsinfo_service import get_ratsinfo_snapshot" not in text:
    marker = "from platform_runtime import get_platform_snapshot\n"
    if marker not in text:
        raise SystemExit("community_routes import marker missing")
    text = text.replace(marker, marker + "from ratsinfo_service import get_ratsinfo_snapshot\n", 1)

old_route = '''@router.get("/politik-rat")
async def public_politics():
    return politics_page(get_civic_items())
'''
new_route = '''@router.get("/politik-rat")
async def public_politics(q: str = "", jahr: str = ""):
    query = _clean(q, 120)
    year = _clean(jahr, 4)
    return politics_page(
        get_civic_items(),
        get_ratsinfo_snapshot(query=query, year=year),
    )


@router.get("/api/politik-rat")
async def public_politics_data(q: str = "", jahr: str = ""):
    return JSONResponse(
        get_ratsinfo_snapshot(
            query=_clean(q, 120),
            year=_clean(jahr, 4),
        )
    )
'''
if old_route not in text:
    raise SystemExit("public politics route marker missing")
text = text.replace(old_route, new_route, 1)
path.write_text(text, encoding="utf-8")


# community_ui.py: replace the simple list with a professional Ratsportal UI.
path = Path("community_ui.py")
text = path.read_text(encoding="utf-8")
start = text.index("def politics_page(")
end = text.index("\n\n_PUBLIC_MAP_TEMPLATE", start)
NEW_POLITICS = r'''def politics_page(items, ratsinfo: dict | None = None) -> HTMLResponse:
    ratsinfo = ratsinfo or {}
    cfg = get_platform_snapshot()
    municipality = str(cfg.get("municipality_name") or "Ahnsen")
    meetings = list(ratsinfo.get("meetings") or [])
    query = str(ratsinfo.get("query") or "")
    selected_year = ratsinfo.get("selected_year")
    years = list(ratsinfo.get("years") or [])
    portal_url = str(ratsinfo.get("official_portal_url") or "https://samtgemeinde-eilsen.ratsinfomanagement.net/")
    info_url = str(ratsinfo.get("official_info_url") or "https://www.samtgemeinde-eilsen.de/content/samtgemeinde/politik/ratsinformationssystem.html")
    auto_mode = ratsinfo.get("mode") == "oparl" and bool(ratsinfo.get("available"))

    def document_buttons(documents: list[dict]) -> str:
        buttons = []
        for document in documents:
            name = escape(str(document.get("name") or document.get("kind") or "Dokument"))
            kind = escape(str(document.get("kind") or "Dokument"))
            url = escape(str(document.get("url") or document.get("download_url") or ""), quote=True)
            download = escape(str(document.get("download_url") or ""), quote=True)
            if not url:
                continue
            buttons.append(
                f'<a class="council-doc" href="{url}" target="_blank" rel="noopener"><span>📄</span><span><small>{kind}</small><strong>{name}</strong></span></a>'
            )
            if download and download != url:
                buttons.append(
                    f'<a class="council-doc download" href="{download}" target="_blank" rel="noopener"><span>↓</span><span><small>Download</small><strong>Originaldatei herunterladen</strong></span></a>'
                )
        return "".join(buttons)

    def agenda_block(agenda: list[dict]) -> str:
        if not agenda:
            return ""
        rows = []
        for item in agenda:
            number = escape(str(item.get("number") or ""))
            name = escape(str(item.get("name") or "Tagesordnungspunkt"))
            result = escape(str(item.get("result") or ""))
            resolution = escape(str(item.get("resolution_text") or ""))
            resolution_file = item.get("resolution_file") if isinstance(item.get("resolution_file"), dict) else None
            extra = ""
            if result:
                extra += f'<p><strong>Ergebnis:</strong> {result}</p>'
            if resolution:
                extra += f'<p><strong>Beschluss:</strong> {resolution}</p>'
            if resolution_file:
                extra += '<div class="council-doc-grid compact">' + document_buttons([resolution_file]) + '</div>'
            rows.append(
                f'<article class="agenda-row"><span class="agenda-number">{number or "•"}</span><div><strong>{name}</strong>{extra}</div></article>'
            )
        return f'<details class="agenda-details"><summary>Tagesordnung ansehen <span>{len(rows)} öffentliche Punkte</span></summary><div class="agenda-list">{"".join(rows)}</div></details>'

    meeting_cards = []
    for meeting in meetings:
        documents = list(meeting.get("documents") or [])
        agenda = list(meeting.get("agenda") or [])
        organization = str(meeting.get("organization") or f"Gemeinderat {municipality}")
        location = str(meeting.get("location") or "")
        web = escape(str(meeting.get("web") or portal_url), quote=True)
        document_area = document_buttons(documents)
        meeting_cards.append(
            f'''<article class="council-meeting-card">
                <div class="council-date-box"><strong>{escape(str(meeting.get("date_label") or "Termin"))}</strong><small>{escape(str(meeting.get("time_label") or ""))}</small></div>
                <div class="council-meeting-main">
                    <span class="civic-kind">{escape(organization or "Ratssitzung")}</span>
                    <h2>{escape(str(meeting.get("name") or "Ratssitzung"))}</h2>
                    <div class="community-meta">
                        {f'<span class="community-chip">📍 {escape(location)}</span>' if location else ''}
                        <span class="community-chip">Amtliche Quelle</span>
                    </div>
                    <div class="council-actions"><a class="secondary-button small-button" href="{web}" target="_blank" rel="noopener">Sitzung im Original öffnen</a></div>
                    {f'<div class="council-doc-grid">{document_area}</div>' if document_area else '<p class="council-doc-empty">Für diese Sitzung wurden über die Schnittstelle noch keine öffentlichen Dateien geliefert.</p>'}
                    {agenda_block(agenda)}
                </div>
            </article>'''
        )

    if meeting_cards:
        meeting_area = "".join(meeting_cards)
    elif auto_mode:
        meeting_area = '<div class="community-empty"><strong>Keine Sitzung im gewählten Filter gefunden.</strong><p>Ändere Jahr oder Suchbegriff. Die amtlichen Daten werden automatisch aus dem Ratsinformationssystem übernommen.</p></div>'
    else:
        meeting_area = f'''<section class="council-source-empty">
            <div class="council-source-icon">🏛️</div>
            <div><strong>Amtliches Ratsinformationssystem ist verknüpft</strong><p>Die öffentlichen Sitzungsunterlagen können bereits direkt im offiziellen Portal geöffnet werden. Eine automatische OParl-Datenschnittstelle ist für diese Installation derzeit nicht konfiguriert; deshalb erfinden oder kopieren wir hier keine Sitzungsdaten.</p></div>
            <a class="primary-button" href="{escape(portal_url, quote=True)}" target="_blank" rel="noopener">Offizielles Ratsinfo öffnen</a>
        </section>'''

    local_rows = []
    for item in items:
        source = f'<a class="secondary-button small-button" href="{escape(item.source_url, quote=True)}" target="_blank" rel="noopener">Originalquelle</a>' if item.source_url else ""
        date_chip = f'<span class="community-chip">📅 {escape(item.date_text)}</span>' if item.date_text else ""
        location_chip = f'<span class="community-chip">📍 {escape(item.location)}</span>' if item.location else ""
        local_rows.append(
            f'<article class="community-card civic-item"><span class="civic-kind">{escape(item.kind)}</span><h2>{escape(item.title)}</h2>'
            f'<div class="community-meta">{date_chip}{location_chip}</div>'
            f'<p>{escape(item.body)}</p>{source}</article>'
        )
    local_area = "".join(local_rows) or '<div class="community-empty"><strong>Noch keine redaktionellen Hinweise.</strong><p>Dieser Bereich kann von der Verwaltung für verständliche Ergänzungen und kommunalpolitische Informationen genutzt werden.</p></div>'

    year_links = ['<a class="council-year' + (' active' if not selected_year else '') + f'" href="/politik-rat?q={escape(query, quote=True)}">Alle</a>']
    for year in years:
        active = " active" if selected_year == year else ""
        year_links.append(f'<a class="council-year{active}" href="/politik-rat?jahr={year}&q={escape(query, quote=True)}">{year}</a>')

    source_badge = '<span class="community-chip done">● Automatisch synchronisiert · OParl</span>' if auto_mode else '<span class="community-chip">● Offizielle Quelle verknüpft</span>'
    status_text = (
        f'{ratsinfo.get("meeting_count_all", len(meetings))} Sitzungen aus der amtlichen Schnittstelle verfügbar.'
        if auto_mode
        else 'Amtliche Dokumente werden direkt beim Ratsinformationssystem der Samtgemeinde geöffnet.'
    )

    styles = """
    <style>
    .council-portal{display:grid;gap:16px}.council-source{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:14px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f2f7ef);box-shadow:var(--shadow-soft)}.council-source h2{margin:5px 0 7px;color:var(--forest);font-size:clamp(23px,5vw,32px)}.council-source p{margin:0;color:var(--muted);line-height:1.55}.council-source-side{display:grid;align-content:center;gap:9px;padding:14px;border:1px solid #dce6d8;border-radius:18px;background:rgba(255,255,255,.78)}.council-source-side strong{color:var(--forest)}.council-source-side small{color:var(--muted);line-height:1.45}.council-source-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    .council-filter{padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(25,64,45,.05)}.council-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.council-search input{min-width:0;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:#fbfcfa;font-size:15px}.council-search button{border:0;border-radius:14px;padding:0 17px;background:var(--forest);color:#fff;font-weight:900}.council-years{display:flex;gap:7px;overflow-x:auto;margin-top:11px;padding-bottom:2px;scrollbar-width:none}.council-years::-webkit-scrollbar{display:none}.council-year{flex:0 0 auto;padding:7px 10px;border:1px solid #dce4d8;border-radius:999px;background:#f8faf6;color:#526158;text-decoration:none;font-size:11px;font-weight:900}.council-year.active{border-color:var(--forest);background:var(--forest);color:#fff}
    .council-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:2px 1px}.council-section-head h2{margin:3px 0 0;color:var(--forest)}.council-section-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.council-result-count{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:#eef4eb;color:var(--forest);font-size:11px;font-weight:900}.council-meetings{display:grid;gap:12px}.council-meeting-card{display:grid;grid-template-columns:112px minmax(0,1fr);gap:15px;padding:17px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.council-date-box{align-self:start;display:grid;gap:4px;padding:12px;border-radius:16px;background:#edf4e9;color:var(--forest);text-align:center}.council-date-box strong{font-size:15px}.council-date-box small{color:#647268;font-size:11px}.council-meeting-main{min-width:0}.council-meeting-main h2{margin:4px 0 7px;color:var(--forest);font-size:20px}.council-actions{margin:10px 0}.council-doc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px}.council-doc-grid.compact{grid-template-columns:minmax(0,330px);margin-top:8px}.council-doc{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;padding:10px;border:1px solid #dfe7db;border-radius:14px;background:#f8faf6;color:inherit;text-decoration:none}.council-doc>span:first-child{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#e9f1e5;color:var(--forest);font-weight:900}.council-doc small,.council-doc strong{display:block}.council-doc small{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.council-doc strong{margin-top:2px;color:#31513f;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.council-doc.download{background:#f3f7ef}.council-doc-empty{margin:10px 0 0!important;font-size:12px!important}.agenda-details{margin-top:13px;border-top:1px solid #e7ece4;padding-top:11px}.agenda-details summary{cursor:pointer;color:var(--forest);font-weight:900}.agenda-details summary span{margin-left:5px;color:var(--muted);font-size:10px;font-weight:800}.agenda-list{display:grid;gap:0;margin-top:9px}.agenda-row{display:grid;grid-template-columns:35px minmax(0,1fr);gap:9px;padding:10px 0;border-top:1px solid #edf0ea}.agenda-row:first-child{border-top:0}.agenda-number{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#eef3eb;color:var(--forest);font-size:10px;font-weight:900}.agenda-row p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
    .council-source-empty{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center;padding:18px;border:1px dashed #b9cbb4;border-radius:20px;background:#f8faf5}.council-source-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:#eaf2e6;font-size:23px}.council-source-empty p{margin:4px 0 0;color:var(--muted);line-height:1.5}.council-editorial{padding-top:17px;border-top:1px solid var(--line)}
    @media(max-width:720px){.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:1fr}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:1fr auto}}
    @media(max-width:430px){.council-search{grid-template-columns:1fr}.council-search button{min-height:44px}.council-source-links{display:grid}.council-result-count{display:none}}
    </style>
    """

    content = f"""{COMMUNITY_CSS}{styles}
    {_heading('Transparenz','Politik & Rat',f'Sitzungen, Tagesordnungen, Protokolle und Beschlüsse für {municipality}.')}
    <div class="council-portal">
      <section class="council-source">
        <div><span class="eyebrow">Amtliche Ratsinformationen</span><h2>Gemeinderat {escape(municipality)} im Überblick</h2><p>Durchsuche Sitzungen, öffentliche Tagesordnungen, Beschlüsse und Niederschriften. Amtliche Originalunterlagen bleiben immer direkt mit ihrer offiziellen Quelle verknüpft.</p><div class="community-meta">{source_badge}</div><div class="council-source-links"><a class="primary-button" href="{escape(portal_url, quote=True)}" target="_blank" rel="noopener">Offizielles Ratsinfo</a><a class="secondary-button" href="{escape(info_url, quote=True)}" target="_blank" rel="noopener">Infos der Samtgemeinde</a></div></div>
        <div class="council-source-side"><span class="eyebrow">Datenstatus</span><strong>{'Live-Schnittstelle aktiv' if auto_mode else 'Offizielle Quelle verknüpft'}</strong><small>{escape(status_text)}</small><small>Zeitraum: etwa {ratsinfo.get('lookback_years', 5)} Jahre · Filter: {escape(str(ratsinfo.get('organization_match') or municipality))}</small></div>
      </section>
      <section class="council-filter"><form class="council-search" method="get" action="/politik-rat"><input type="search" name="q" maxlength="120" value="{escape(query, quote=True)}" placeholder="Sitzungen durchsuchen, z. B. Haushalt, Straße, DGH …"><input type="hidden" name="jahr" value="{escape(str(selected_year or ''), quote=True)}"><button type="submit">Suchen</button></form><div class="council-years">{''.join(year_links)}</div></section>
      <div class="council-section-head"><div><span class="eyebrow">Sitzungsarchiv</span><h2>Amtliche Sitzungen & Dokumente</h2><p>{'Gefilterte Ergebnisse aus der OParl-Schnittstelle.' if auto_mode else 'Direkter Zugang zum offiziellen Ratsinformationssystem; automatische Datensätze erscheinen hier, sobald OParl konfiguriert ist.'}</p></div><span class="council-result-count">{len(meetings)} Treffer</span></div>
      <section class="council-meetings">{meeting_area}</section>
      <section class="council-editorial"><div class="council-section-head"><div><span class="eyebrow">Zusätzliche Informationen</span><h2>Hinweise aus der Gemeinde</h2><p>Redaktionelle Erläuterungen ergänzen die amtlichen Unterlagen, ersetzen sie aber nicht.</p></div></div><div class="civic-list">{local_area}</div></section>
    </div>"""
    return page("Politik & Rat", content, active="home", body_class="community-view")
'''
text = text[:start] + NEW_POLITICS + text[end:]
path.write_text(text, encoding="utf-8")


# community_search.py: include synced council meetings and agenda/resolution text in global search.
path = Path("community_search.py")
text = path.read_text(encoding="utf-8")
if "from urllib.parse import quote" not in text:
    text = text.replace("from html import unescape\n", "from html import unescape\nfrom urllib.parse import quote\n", 1)
if "from ratsinfo_service import get_ratsinfo_snapshot" not in text:
    marker = "from platform_runtime import apply_static_branding, get_platform_snapshot\n"
    if marker not in text:
        raise SystemExit("community_search import marker missing")
    text = text.replace(marker, marker + "from ratsinfo_service import get_ratsinfo_snapshot\n", 1)

civic_marker = '''    for item in get_civic_items(limit=100):
        candidates.append({
            "title": item.title,
            "text": f"{item.kind} {item.date_text} {item.location} {item.body}",
            "url": "/politik-rat",
            "kind": "politik",
        })

'''
rats_search = civic_marker + '''    ratsinfo = get_ratsinfo_snapshot(query=query)
    for meeting in ratsinfo.get("meetings") or []:
        agenda_text = " ".join(
            " ".join(
                [
                    str(point.get("number") or ""),
                    str(point.get("name") or ""),
                    str(point.get("result") or ""),
                    str(point.get("resolution_text") or ""),
                ]
            )
            for point in meeting.get("agenda") or []
        )
        document_text = " ".join(
            f"{document.get('kind', '')} {document.get('name', '')}"
            for document in meeting.get("documents") or []
        )
        candidates.append({
            "title": str(meeting.get("name") or "Ratssitzung"),
            "text": " ".join(
                [
                    str(meeting.get("organization") or ""),
                    str(meeting.get("date_label") or ""),
                    str(meeting.get("location") or ""),
                    document_text,
                    agenda_text,
                ]
            ),
            "url": f"/politik-rat?q={quote(query)}",
            "kind": "ratssitzung",
        })

'''
if civic_marker not in text:
    raise SystemExit("community_search civic marker missing")
text = text.replace(civic_marker, rats_search, 1)
path.write_text(text, encoding="utf-8")


# pwa_ui.py: clearer service-tile wording.
path = Path("pwa_ui.py")
text = path.read_text(encoding="utf-8")
text = text.replace(
    '("politics", "Politik & Rat", "Sitzungen, Beschlüsse und Informationen.", "/politik-rat")',
    '("politics", "Politik & Rat", "Sitzungen, Protokolle und Beschlüsse.", "/politik-rat")',
    1,
)
path.write_text(text, encoding="utf-8")


# Permanent network-free smoke test for the integration.
workflow = '''name: Ratsinfo smoke tests
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Compile Ratsportal integration
        run: python -m py_compile ratsinfo_service.py community_routes.py community_ui.py community_search.py pwa_ui.py
      - name: Validate portal fallback without external network
        env:
          RATSINFO_OPARL_SYSTEM_URL: ""
        run: |
          python - <<'PY'
          import ratsinfo_service as service
          from community_ui import politics_page
          snapshot = service.get_ratsinfo_snapshot(query="", year="")
          assert snapshot["official_portal_url"].startswith("https://")
          assert snapshot["official_info_url"].startswith("https://")
          assert snapshot["oparl_configured"] is False
          assert snapshot["mode"] == "portal"
          assert len(snapshot["years"]) >= 5
          html = politics_page([], snapshot).body.decode("utf-8")
          assert "Amtliche Sitzungen &amp; Dokumente" in html or "Amtliche Sitzungen & Dokumente" in html
          assert "Offizielles Ratsinfo" in html
          assert "automatische OParl-Datenschnittstelle" in html
          routes = open("community_routes.py", encoding="utf-8").read()
          assert '/api/politik-rat' in routes
          search = open("community_search.py", encoding="utf-8").read()
          assert 'get_ratsinfo_snapshot' in search
          tile = open("pwa_ui.py", encoding="utf-8").read()
          assert 'Sitzungen, Protokolle und Beschlüsse.' in tile
          PY
'''
Path(".github/workflows/ratsinfo-smoke.yml").write_text(workflow, encoding="utf-8")

for file_name, needle in (
    ("community_routes.py", 'get_ratsinfo_snapshot(query=query, year=year)'),
    ("community_ui.py", 'Amtliche Sitzungen & Dokumente'),
    ("community_search.py", 'kind": "ratssitzung"'),
    ("pwa_ui.py", 'Sitzungen, Protokolle und Beschlüsse.'),
):
    if needle not in Path(file_name).read_text(encoding="utf-8"):
        raise SystemExit(f"validation marker missing in {file_name}: {needle}")
