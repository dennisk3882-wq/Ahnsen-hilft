from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from pwa_crud import get_users_for_push_category


DEFAULT_URLS = {
    "push_veranstaltungen": "/veranstaltungen",
    "push_aktuelles": "/aktuelles",
    "push_buergerinfo": "/buergerinformationen",
    "push_vereine": "/vereine",
    "push_feuerwehr": "/feuerwehr",
    "push_verkehr": "/aktuelles",
    "push_warnungen": "/",
    "push_muell": "/muelltermine-info",
}


def push_dashboard_page(categories: dict[str, str], hinweis: str = "", fehler: str = "", history=None) -> HTMLResponse:
    options = []
    cards = []
    for key, label in categories.items():
        count = len(get_users_for_push_category(key))
        options.append(f'<option value="{escape(key)}" data-url="{escape(DEFAULT_URLS.get(key, "/"))}">{escape(label)}</option>')
        cards.append(
            f'<article class="push-stat"><span>{escape(label)}</span><strong>{count}</strong><small>Opt-in Konten</small></article>'
        )

    message = ""
    if hinweis:
        message += f'<div class="message">✓ {escape(hinweis)}</div>'
    if fehler:
        message += f'<div class="message error">⚠ {escape(fehler)}</div>'
    history_html = "".join(f'<div class="admin-row"><strong>{escape(item.detail)}</strong><br><small>{item.erstellt_am.strftime("%d.%m.%Y %H:%M") if item.erstellt_am else ""} · {escape(item.actor)} · {escape(item.object_id)}</small></div>' for item in (history or [])) or '<div class="admin-row">Noch kein manueller Push-Versand protokolliert.</div>'

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#174936">
      <title>Push-Nachrichten · Ahnsen hilft</title>
      <style>
        {intern_nav_css()}
        .push-stats{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}}
        .push-stat{{padding:17px;border:1px solid var(--admin-line);border-radius:20px;background:var(--admin-paper);box-shadow:var(--admin-shadow-soft)}}
        .push-stat span{{display:block;color:var(--admin-muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}}
        .push-stat strong{{display:block;margin:6px 0;color:var(--admin-forest);font-family:Georgia,serif;font-size:34px}}
        .push-stat small{{color:var(--admin-muted)}}
        .push-layout{{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:20px;align-items:start}}
        .push-form{{display:grid;gap:13px}}
        .push-field{{display:grid;gap:6px}}.push-field span{{font-size:12px;font-weight:900;color:#465349}}
        .push-warning{{padding:14px;border:1px solid #efd99b;border-radius:16px;color:#79530e;background:#fff7dd;line-height:1.5}}
        .push-warning strong{{display:block;margin-bottom:4px}}
        .push-help{{display:grid;gap:10px}}.push-help article{{padding:14px;border-radius:16px;background:#f5f8f2}}
        .push-help h3{{margin:0 0 5px;font-size:16px!important}}.push-help p{{margin:0;color:var(--admin-muted);line-height:1.45}}
        @media(max-width:950px){{.push-layout{{grid-template-columns:1fr}}.push-stats{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
        @media(max-width:520px){{.push-stats{{grid-template-columns:1fr 1fr}}}}
      </style>
    </head>
    <body>
      <main class="admin-page">
        {intern_nav("push")}
        <section class="admin-hero">
          <span class="admin-eyebrow">Benachrichtigungszentrale</span>
          <h1>Push-Nachrichten</h1>
          <p>Sende gezielte Informationen nur an Bürger, die die jeweilige Kategorie in ihrem Profil ausdrücklich aktiviert haben.</p>
        </section>
        {message}
        <section class="push-stats">{''.join(cards)}</section>
        <div class="push-layout">
          <section class="box">
            <h2>Nachricht senden</h2>
            <div class="push-warning"><strong>🔔 Wird sofort als Push versendet</strong>Beim Absenden erhalten alle aktuell registrierten Geräte der Opt-in-Nutzer dieser Kategorie die Nachricht.</div>
            <form class="push-form" method="post" action="/intern/push/senden" onsubmit="return confirm('Push-Nachricht jetzt wirklich an alle Opt-in-Nutzer dieser Kategorie senden?')">
              <label class="push-field"><span>Kategorie *</span><select id="push-category" name="category" required>{''.join(options)}</select></label>
              <label class="push-field"><span>Titel *</span><input name="title" maxlength="120" required placeholder="z. B. Straßensperrung in der Flöte"></label>
              <label class="push-field"><span>Nachricht *</span><textarea name="body" maxlength="500" required placeholder="Kurze, klare Information für die Bürger"></textarea></label>
              <label class="push-field"><span>Zielseite in der PWA</span><input id="push-url" name="url" value="/veranstaltungen" maxlength="500"></label>
              <button type="submit">🔔 Push jetzt senden</button>
            </form>
          </section>
          <aside class="box push-help">
            <h2>Automatische Pushs</h2>
            <article><h3>Mängelmeldungen</h3><p>Bei einer Statusänderung erhält nur der betreffende Bürger eine Nachricht, sofern aktiviert.</p></article>
            <article><h3>DGH-Anfragen</h3><p>Zu- und Absagen sowie Statusänderungen gehen nur an den Antragsteller, sofern aktiviert.</p></article>
            <article><h3>Veranstaltungen</h3><p>Neue und bearbeitete aktive Veranstaltungen werden automatisch an Veranstaltungs-Abonnenten gesendet.</p></article>
            <article><h3>Müllabfuhr</h3><p>Die Erinnerung läuft weiterhin automatisch am Vortag um 18 Uhr.</p></article>
            <article><h3>Amtliche Warnungen</h3><p>DWD und Bundeswarnportal werden automatisch überwacht. Verwaltung und Bürger sehen die Warnlage in einer eigenen Zentrale.</p><p><a href="/intern/warnungen">Warnzentrale öffnen →</a></p></article>
          </aside>
        </div>
        <section class="box" style="margin-top:20px"><h2>Versandverlauf</h2><p class="muted">Dokumentiert Zeitpunkt, Absender, Kategorie und Zielseite der manuellen Rundnachrichten.</p><div class="admin-list">{history_html}</div></section>
      </main>
      <script>
        const category=document.getElementById('push-category');
        const url=document.getElementById('push-url');
        category?.addEventListener('change',()=>{{const option=category.options[category.selectedIndex];if(option?.dataset.url)url.value=option.dataset.url;}});
      </script>
    </body>
    </html>
    """
    return HTMLResponse(html)
