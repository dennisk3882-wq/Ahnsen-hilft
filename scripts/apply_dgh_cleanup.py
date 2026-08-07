from pathlib import Path

path = Path("pwa_account_ui.py")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        ".dgh-calendar-note strong{color:var(--forest)}.dgh-availability-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}.dgh-availability-stat{padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}.dgh-availability-stat small{display:block;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.dgh-availability-stat strong{display:block;margin-top:5px;color:var(--forest);font-size:25px}.dgh-next-days{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.dgh-next-days a{padding:8px 11px;border:1px solid #cbe2d0;border-radius:999px;color:var(--forest);background:#eef8f0;font-size:12px;font-weight:900;text-decoration:none}.dgh-date-prefill",
        ".dgh-calendar-note strong{color:var(--forest)}.dgh-date-prefill",
    ),
    (
        ".dgh-day-state{left:5px;right:5px;bottom:5px;font-size:7px}.dgh-availability-grid{grid-template-columns:1fr}.dgh-calendar-legend",
        ".dgh-day-state{left:5px;right:5px;bottom:5px;font-size:7px}.dgh-calendar-legend",
    ),
    ("    requested = 0\n", ""),
    ("            requested += 1\n", ""),
    (
        "    next_days = [day for day in list(free_days) if day >= today][:6]\n    next_days_html = \"\".join(\n        f'<a href=\"/dgh-anfrage?datum={day.isoformat()}\">{day.strftime(\"%d.%m.%Y\")}</a>'\n        for day in next_days\n    ) or '<span class=\"muted\">Freie Termine werden derzeit aktualisiert.</span>'\n\n",
        "",
    ),
    (
        "<div class=\"dgh-availability-grid\"><article class=\"dgh-availability-stat\"><small>Belegt</small><strong>{confirmed}</strong></article><article class=\"dgh-availability-stat\"><small>Offene Anfragen</small><strong>{requested}</strong></article><article class=\"dgh-availability-stat\"><small>Kalender-Vorschau</small><strong>12 Monate</strong></article></div>\n",
        "",
    ),
    (
        "<section class=\"content-card\"><div class=\"section-title\"><span class=\"eyebrow\">Schnellauswahl</span><h2>Nächste freie Tage</h2></div><div class=\"dgh-next-days\">{next_days_html}</div></section>\n",
        "",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Erwartete Stelle nicht eindeutig gefunden ({count} Treffer): {old[:90]}")
    text = text.replace(old, new, 1)

for forbidden in (
    "dgh-availability-grid",
    "dgh-availability-stat",
    "dgh-next-days",
    "Kalender-Vorschau",
    "Schnellauswahl",
    "next_days_html",
    "requested += 1",
):
    if forbidden in text:
        raise SystemExit(f"Rest gefunden: {forbidden}")

path.write_text(text, encoding="utf-8")
Path("scripts/apply_dgh_cleanup.py").unlink(missing_ok=True)
Path(".github/workflows/apply-dgh-cleanup.yml").unlink(missing_ok=True)
