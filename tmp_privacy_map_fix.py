from pathlib import Path

routes_path = Path('community_routes.py')
routes = routes_path.read_text(encoding='utf-8')
routes = routes.replace('    email_pattern = re.compile(r"\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", re.IGNORECASE)\n    phone_pattern = re.compile(r"(?<!\\w)(?:\\+49|0)[\\d\\s()/.\\-]{6,}\\d")\n\n    def public_description(value) -> str:\n        text = str(value or "")\n        text = gps_pattern.sub(" ", text)\n        text = email_pattern.sub("[Kontakt entfernt]", text)\n        text = phone_pattern.sub("[Kontakt entfernt]", text)\n        text = re.sub(r"\\s+", " ", text).strip(" -–—,;")\n        return text[:260]\n\n', '')
routes = routes.replace('            "description": public_description(description),\n', '')
routes_path.write_text(routes, encoding='utf-8')

ui_path = Path('community_ui.py')
ui = ui_path.read_text(encoding='utf-8')
ui = ui.replace("document.getElementById('detail-description').textContent=p.description||'Für diese öffentliche Meldung liegt keine weitere Beschreibung vor.';", "document.getElementById('detail-description').textContent='Der freie Meldetext bleibt aus Datenschutzgründen nicht öffentlich. Kategorie, Bearbeitungsstand, Datum und ungefährer Ort sind hier sichtbar.';")
ui = ui.replace(" const description=(p.description||'').slice(0,105); return `<button class=\"defect-list-item\" type=\"button\" data-point-key=\"${esc(p._key)}\"><span class=\"defect-list-icon\">${glyph(p.category)}</span><span class=\"defect-list-copy\"><strong>${esc(p.category||'Meldung')}</strong><span>${esc(p.ort||'__MUNICIPALITY__')}${description?' · '+esc(description):''}</span></span>", " return `<button class=\"defect-list-item\" type=\"button\" data-point-key=\"${esc(p._key)}\"><span class=\"defect-list-icon\">${glyph(p.category)}</span><span class=\"defect-list-copy\"><strong>${esc(p.category||'Meldung')}</strong><span>${esc(p.ort||'__MUNICIPALITY__')}</span></span>")
ui_path.write_text(ui, encoding='utf-8')
