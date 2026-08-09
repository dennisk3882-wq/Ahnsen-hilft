from pathlib import Path

path = Path('community_ui.py')
text = path.read_text(encoding='utf-8')
old = '''        council_member_cards.append(
            f"""<article class=\\"council-person\\">
              <div class=\\"council-person-head\\"><span class=\\"council-party {party_key}\\">{escape(party)}</span>{f'<span class=\\"council-role\\">{escape(role)}</span>' if role != 'Ratsmitglied' else ''}</div>
              <h3>{escape(str(member.get('name') or 'Ratsmitglied'))}</h3>
              <div class=\\"council-person-facts\\"><span><small>Alter</small><strong>{escape(str(member.get('age') or 'nicht öffentlich verifiziert'))}</strong></span><span><small>Wohnort</small><strong>{escape(str(member.get('residence') or municipality))}</strong></span></div>
              {f'<p class=\\"council-person-note\\">{escape(note)}</p>' if note else ''}
            </article>"""
        )
'''
new = '''        role_badge = f'<span class="council-role">{escape(role)}</span>' if role != "Ratsmitglied" else ""
        note_html = f'<p class="council-person-note">{escape(note)}</p>' if note else ""
        council_member_cards.append(
            f"""<article class="council-person">
              <div class="council-person-head"><span class="council-party {party_key}">{escape(party)}</span>{role_badge}</div>
              <h3>{escape(str(member.get('name') or 'Ratsmitglied'))}</h3>
              <div class="council-person-facts"><span><small>Alter</small><strong>{escape(str(member.get('age') or 'nicht öffentlich verifiziert'))}</strong></span><span><small>Wohnort</small><strong>{escape(str(member.get('residence') or municipality))}</strong></span></div>
              {note_html}
            </article>"""
        )
'''
if old not in text:
    raise SystemExit('Problematischer Ratsmitglieder-f-string-Block nicht gefunden')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Ratsmitglieder-f-strings Python-3.11-kompatibel gemacht.')
