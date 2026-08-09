from pathlib import Path

path = Path('scripts/apply_event_recap.py')
text = path.read_text(encoding='utf-8')
text = text.replace("DASHBOARD = r'''", 'DASHBOARD = r"""', 1)
text = text.replace('    html = f"""', "    html = f'''", 1)
old_end = '    </html>\n    """\n    return HTMLResponse(html)\n\'\'\'\n\nPath(\'veranstaltungen_models.py\')'
new_end = '    </html>\n    \'\'\'\n    return HTMLResponse(html)\n"""\n\nPath(\'veranstaltungen_models.py\')'
if old_end not in text:
    raise SystemExit('dashboard delimiter end marker missing')
text = text.replace(old_end, new_end, 1)
path.write_text(text, encoding='utf-8')
