from pathlib import Path

path = Path('community_ui.py')
text = path.read_text(encoding='utf-8')

replacements = [
    (
'''    portal_url = str(ratsinfo.get("official_portal_url") or "https://samtgemeinde-eilsen.ratsinfomanagement.net/")
    info_url = str(ratsinfo.get("official_info_url") or "https://www.samtgemeinde-eilsen.de/content/samtgemeinde/politik/ratsinformationssystem.html")
    auto_mode = ratsinfo.get("mode") == "oparl" and bool(ratsinfo.get("available"))
''',
'''    auto_mode = ratsinfo.get("mode") == "oparl" and bool(ratsinfo.get("available"))
'''),
    (
'''            url = escape(str(document.get("url") or document.get("download_url") or ""), quote=True)
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
''',
'''            download = escape(str(document.get("download_url") or document.get("url") or ""), quote=True)
            if not download:
                continue
            buttons.append(
                f'<a class="council-doc download" href="{download}" target="_blank" rel="noopener"><span>↓</span><span><small>{kind}</small><strong>{name}</strong><em>Originaldatei der Samtgemeinde herunterladen ↗</em></span></a>'
            )
'''),
    (
'''        web = escape(str(meeting.get("web") or portal_url), quote=True)
        document_area = document_buttons(documents)
''',
'''        document_area = document_buttons(documents)
'''),
    (
'''                    <div class="council-actions"><a class="secondary-button small-button" href="{web}" target="_blank" rel="noopener">Sitzung im Original öffnen</a></div>
''',
'''                    <div class="council-internal-note">Alle Sitzungsdetails bleiben in Ahnsen hilft. Nur ein Dokument-Download öffnet die amtliche Originaldatei.</div>
'''),
    (
'''        meeting_area = f"""<section class="council-source-empty">
            <div class="council-source-icon">🏛️</div>
            <div><strong>Amtliches Ratsinformationssystem ist verknüpft</strong><p>Die öffentlichen Sitzungsunterlagen können bereits direkt im offiziellen Portal geöffnet werden. Eine automatische OParl-Datenschnittstelle ist für diese Installation derzeit nicht konfiguriert; deshalb erfinden oder kopieren wir hier keine Sitzungsdaten.</p></div>
            <a class="primary-button" href="{escape(portal_url, quote=True)}" target="_blank" rel="noopener">Offizielles Ratsinfo öffnen</a>
        </section>"""
''',
'''        meeting_area = """<section class="council-source-empty">
            <div class="council-source-icon">🏛️</div>
            <div><strong>Das 5-Jahres-Archiv ist technisch vorbereitet</strong><p>Die Navigation, Suche und Jahresfilter bleiben vollständig in Ahnsen hilft. Für den automatischen Import der amtlichen Sitzungen fehlt derzeit eine freigegebene maschinenlesbare Schnittstelle der Samtgemeinde. Deshalb werden hier keine unvollständigen oder erfundenen Sitzungsdaten angezeigt.</p><p class="council-source-detail">Sobald eine offizielle Datenquelle freigeschaltet ist, erscheinen die Ahnsener Sitzungen der letzten fünf Jahre hier automatisch. Die Originaldateien werden dann ausschließlich über ihre direkten amtlichen Download-Links bereitgestellt.</p></div>
        </section>"""
'''),
    (
'''        source = f'<a class="secondary-button small-button" href="{escape(item.source_url, quote=True)}" target="_blank" rel="noopener">Originalquelle</a>' if item.source_url else ""
''',
'''        source = ""
'''),
    (
'''    source_badge = '<span class="community-chip done">● Automatisch synchronisiert · OParl</span>' if auto_mode else '<span class="community-chip">● Offizielle Quelle verknüpft</span>'
''',
'''    source_badge = '<span class="community-chip done">● Amtliche Sitzungsdaten automatisch synchronisiert</span>' if auto_mode else '<span class="community-chip warn">● Automatischer Datenabruf noch nicht freigeschaltet</span>'
'''),
    (
'''        else 'Amtliche Dokumente werden direkt beim Ratsinformationssystem der Samtgemeinde geöffnet.'
''',
'''        else 'Die Oberfläche bleibt vollständig in Ahnsen hilft; für das vollständige Archiv wird noch eine freigegebene amtliche Datenschnittstelle benötigt.'
'''),
    (
'''.council-doc strong{margin-top:2px;color:#31513f;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.council-doc.download{background:#f3f7ef}.council-doc-empty''',
'''.council-doc strong{margin-top:2px;color:#31513f;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.council-doc em{display:block;margin-top:4px;color:var(--forest);font-size:10px;font-style:normal;font-weight:850}.council-doc.download{background:#f3f7ef}.council-internal-note{margin:10px 0;padding:9px 11px;border-radius:13px;background:#f4f8f1;color:#526158;font-size:11px;line-height:1.45}.council-doc-empty'''),
    (
'''.council-source-empty p{margin:4px 0 0;color:var(--muted);line-height:1.5}.council-editorial''',
'''.council-source-empty p{margin:4px 0 0;color:var(--muted);line-height:1.5}.council-source-empty .council-source-detail{margin-top:8px;font-size:11px}.council-editorial'''),
    (
'''        <div><span class="eyebrow">Amtliche Ratsinformationen</span><h2>Gemeinderat {escape(municipality)} im Überblick</h2><p>Durchsuche Sitzungen, öffentliche Tagesordnungen, Beschlüsse und Niederschriften. Amtliche Originalunterlagen bleiben immer direkt mit ihrer offiziellen Quelle verknüpft.</p><div class="community-meta">{source_badge}</div><div class="council-source-links"><a class="primary-button" href="{escape(portal_url, quote=True)}" target="_blank" rel="noopener">Offizielles Ratsinfo</a><a class="secondary-button" href="{escape(info_url, quote=True)}" target="_blank" rel="noopener">Infos der Samtgemeinde</a></div></div>
        <div class="council-source-side"><span class="eyebrow">Datenstatus</span><strong>{'Live-Schnittstelle aktiv' if auto_mode else 'Offizielle Quelle verknüpft'}</strong><small>{escape(status_text)}</small><small>Zeitraum: etwa {ratsinfo.get('lookback_years', 5)} Jahre · Filter: {escape(str(ratsinfo.get('organization_match') or municipality))}</small></div>
''',
'''        <div><span class="eyebrow">Amtliche Ratsinformationen</span><h2>Gemeinderat {escape(municipality)} im Überblick</h2><p>Durchsuche Sitzungen, öffentliche Tagesordnungen, Beschlüsse und Niederschriften direkt hier in Ahnsen hilft. Du verlässt den Politikbereich nur dann, wenn du bewusst eine amtliche Originaldatei herunterlädst.</p><div class="community-meta">{source_badge}</div></div>
        <div class="council-source-side"><span class="eyebrow">Datenstatus</span><strong>{'5-Jahres-Archiv aktiv' if auto_mode else 'Archiv wartet auf amtliche Datenschnittstelle'}</strong><small>{escape(status_text)}</small><small>Zeitraum: etwa {ratsinfo.get('lookback_years', 5)} Jahre · Filter: {escape(str(ratsinfo.get('organization_match') or municipality))}</small></div>
'''),
    (
'''<p>{'Gefilterte Ergebnisse aus der OParl-Schnittstelle.' if auto_mode else 'Direkter Zugang zum offiziellen Ratsinformationssystem; automatische Datensätze erscheinen hier, sobald OParl konfiguriert ist.'}</p>''',
'''<p>{'Gefilterte Ergebnisse aus der amtlichen Schnittstelle – vollständig innerhalb von Ahnsen hilft.' if auto_mode else 'Suche und Jahresfilter bleiben hier in Ahnsen hilft. Sobald die Samtgemeinde einen freigegebenen maschinenlesbaren Datenzugang bereitstellt, wird das vollständige 5-Jahres-Archiv automatisch eingeblendet.'}</p>'''),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, got {count}: {old[:90]!r}')
    text = text.replace(old, new, 1)

# Ensure no ordinary navigation to the external council portal remains in the page renderer.
politics = text[text.index('def politics_page'):text.index('_PUBLIC_MAP_TEMPLATE')]
for forbidden in ('Offizielles Ratsinfo', 'Sitzung im Original öffnen', 'Infos der Samtgemeinde'):
    if forbidden in politics:
        raise SystemExit(f'external navigation marker still present: {forbidden}')
if 'Originaldatei der Samtgemeinde herunterladen' not in politics:
    raise SystemExit('direct document download marker missing')

path.write_text(text, encoding='utf-8')
