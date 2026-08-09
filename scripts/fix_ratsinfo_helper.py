from pathlib import Path

path = Path("scripts/apply_ratsinfo_portal.py")
text = path.read_text(encoding="utf-8")
text = text.replace("f'''<article class=\"council-meeting-card\">", 'f"""<article class="council-meeting-card">')
text = text.replace("</article>'''\n        )", '</article>"""\n        )', 1)
text = text.replace("meeting_area = f'''<section class=\"council-source-empty\">", 'meeting_area = f"""<section class="council-source-empty">')
text = text.replace("</section>'''\n\n    local_rows", '</section>"""\n\n    local_rows', 1)
path.write_text(text, encoding="utf-8")
