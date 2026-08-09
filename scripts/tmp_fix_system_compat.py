from pathlib import Path
p=Path('system_dashboard.py')
s=p.read_text(encoding='utf-8')
old='<span class="admin-eyebrow">Betriebsüberwachung</span>'
new='<span class="admin-eyebrow">System & Diagnose · Betriebsüberwachung</span>'
if old not in s:
    raise SystemExit('System-Eyebrow nicht gefunden')
p.write_text(s.replace(old,new,1),encoding='utf-8')
