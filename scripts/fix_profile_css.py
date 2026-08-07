from pathlib import Path

path = Path('pwa_account_ui.py')
text = path.read_text(encoding='utf-8')
marker = '    content = f"""\n{_extra_css()}\n<style>\n'
start = text.index(marker) + len(marker)
end = text.index('\n</style>\n<section class="profile-hero">', start)
css = text[start:end]
if '{{' not in css:
    css = css.replace('{', '{{').replace('}', '}}')
    text = text[:start] + css + text[end:]
path.write_text(text, encoding='utf-8')
print('Profile CSS braces escaped for Python f-string.')
