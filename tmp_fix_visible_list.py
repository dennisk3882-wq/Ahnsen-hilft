from pathlib import Path

path = Path('community_ui.py')
text = path.read_text(encoding='utf-8')
old = "const renderVisibleList = () => { if(!map.loaded()) return;"
new = "const renderVisibleList = () => {"
if old not in text:
    raise SystemExit('Expected renderVisibleList guard not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
