from __future__ import annotations

from html import escape

import neighborhood_ui as base


EXTRA_CSS = r'''
<style>
html,body{max-width:100%;overflow-x:hidden}
.community-view .page-shell,.community-view main,.nh,.nh>*,.nh-hero,.nh-card{min-width:0;max-width:100%;box-sizing:border-box}
.nh-toolbar{width:100%;max-width:100%;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:4px 0 7px}
.nh-toolbar::-webkit-scrollbar{display:none}
.nh-hero{overflow:hidden}
.nh-subscribe{padding:0;overflow:hidden}
.nh-subscribe summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 18px;cursor:pointer;font-weight:900;color:var(--forest)}
.nh-subscribe summary::-webkit-details-marker{display:none}
.nh-subscribe summary .nh-plus{width:34px;height:34px;display:grid;place-items:center;flex:0 0 34px;border-radius:50%;background:#eef5eb;font-size:1.35rem;line-height:1;transition:transform .18s ease}
.nh-subscribe[open] summary .nh-plus{transform:rotate(45deg)}
.nh-subscribe-body{padding:0 18px 18px;border-top:1px solid var(--line)}
.nh-subscribe-body .nh-copy{margin-top:14px}
@media(max-width:620px){
  .community-view .page-heading,.nh-hero,.nh-card{width:100%}
  .nh-hero{padding:17px}
  .nh-hero h1{font-size:clamp(30px,9vw,42px);line-height:1.05;overflow-wrap:anywhere}
  .nh-copy{overflow-wrap:anywhere}
  .nh-actions{width:100%;min-width:0}
  .nh-actions .nh-btn,.nh-actions form{max-width:100%}
  .nh-card{padding:16px}
  .nh-form .field,.nh-form input,.nh-form select,.nh-form textarea{max-width:100%;min-width:0;box-sizing:border-box}
}
</style>
'''


def _subscription_details(subscriptions: set[str]) -> str:
    checks = ''.join(
        f'<label><input type="checkbox" name="categories" value="{escape(c)}" {"checked" if c in subscriptions else ""}> {escape(c)}</label>'
        for c in base.CATEGORIES
    )
    return f'''<details class="nh-card nh-subscribe">
<summary><span><span class="eyebrow">Benachrichtigungen</span><br>Push für neue Hilfe</span><span class="nh-plus">+</span></summary>
<div class="nh-subscribe-body"><p class="nh-copy">Lass dich bei neuen freigegebenen Beiträgen in deinen Kategorien informieren.</p>
<form class="nh-form" method="post" action="/nachbarschaft/abos">{checks}<button class="nh-btn" type="submit">Abos speichern</button></form></div></details>'''


def neighborhood_page(*, rows, logged_user, favorites: set[int], subscriptions: set[str], urgent_ids: set[int], category: str = "", own: bool = False, message: str = ""):
    uid = getattr(logged_user, "id", None)
    cards = ''.join(base.post_card(post, author, uid, favorites, post.id in urgent_ids) for post, author in rows)
    if not cards:
        cards = '<div class="nh-empty"><strong>Noch keine passenden Beiträge.</strong><p>Mach den Anfang oder ändere den Filter.</p></div>'

    chips = ['<a class="nh-chip active" href="/nachbarschaft">Alle</a>'] + [
        f'<a class="nh-chip" href="/nachbarschaft?kategorie={base.quote(c)}">{escape(c)}</a>' for c in base.CATEGORIES
    ]
    if category:
        chips[0] = chips[0].replace(' active', '')
        chips = [x.replace('class="nh-chip"', 'class="nh-chip active"') if f'kategorie={base.quote(category)}' in x else x for x in chips]

    notice = f'<div class="form-alert success-alert">{escape(message)}</div>' if message else ''

    if logged_user:
        # Die privaten Chats laufen bewusst über das zentrale Nachrichten-Postfach.
        top = '<div class="nh-actions"><a class="nh-btn" href="/nachbarschaft?eigene=1">📌 Meine Anzeigen</a></div>'
        form = f'''<section class="nh-card" id="beitrag"><span class="eyebrow">Neuer Beitrag</span><h2>Hilfe suchen oder anbieten</h2>
<form class="nh-form" method="post" action="/nachbarschaft"><label class="field"><span>Ich …</span><select name="kind"><option>Suche</option><option>Biete</option></select></label>
<label class="field"><span>Kategorie</span><select name="category">{''.join(f'<option>{escape(c)}</option>' for c in base.CATEGORIES)}</select></label>
<label class="field"><span>Titel *</span><input name="title" maxlength="180" required placeholder="z. B. Einkaufshilfe am Dienstag"></label>
<label class="field"><span>Beschreibung *</span><textarea name="description" maxlength="3000" required placeholder="Keine Adresse oder Telefonnummer öffentlich eintragen – dafür gibt es den privaten Chat."></textarea></label>
<label><input type="checkbox" name="urgent" value="ja"> Als dringend markieren</label><button class="nh-btn primary" type="submit">Zur Prüfung einreichen</button></form></section>{_subscription_details(subscriptions)}'''
    else:
        top = ''
        form = '<section class="nh-card"><h2>Mitmachen</h2><p class="nh-copy">Zum Antworten, Erstellen und für private Nachrichten brauchst du ein Bürgerkonto.</p><a class="nh-btn primary" href="/anmelden?next=/nachbarschaft">Anmelden</a></section>'

    own_label = '<span class="eyebrow">Meine Anzeigen</span>' if own else '<span class="eyebrow">Aktuell in Ahnsen</span>'
    body = f'''{base.CSS}{EXTRA_CSS}{base.heading("Nachbarschaftshilfe","Hilfe im Dorf finden, anbieten und danach privat organisieren.")}{notice}
<section class="nh"><section class="nh-hero"><span class="eyebrow">Gemeinsam in Ahnsen</span><h1>Gemeinsam geht vieles leichter.</h1>
<p class="nh-copy">Öffentlich steht nur die Anzeige. Persönliche Daten, Telefonnummern und konkrete Absprachen gehören in den privaten Chat.</p>{top}</section>
<section>{own_label}<div class="nh-toolbar">{''.join(chips)}</div><div class="nh" style="margin-top:9px">{cards}</div></section>{form}</section>'''
    return base.page("Nachbarschaftshilfe", body, active="more", body_class="community-view")


# Die bestehende Route importiert neighborhood_page beim Laden. runtime_extensions lädt
# diesen Patch vor dem finalen Router-Override und ersetzt die Funktion zentral.
base.neighborhood_page = neighborhood_page
