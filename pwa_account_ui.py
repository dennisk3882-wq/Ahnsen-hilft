from __future__ import annotations

from datetime import date
from html import escape
from typing import Iterable

from fastapi.responses import HTMLResponse

from pwa_ui import icon, page


def _extra_css() -> str:
    return '<link rel="stylesheet" href="/pwa-extra.css?v=1">'


def _alert(message: str = "", success: bool = False) -> str:
    if not message:
        return ""
    cls = "form-alert success-alert" if success else "form-alert"
    return f'<div class="{cls}" role="status">{escape(message)}</div>'


def account_page(mode: str, error: str = "", values: dict | None = None, next_url: str = "/profil") -> HTMLResponse:
    values = values or {}
    register = mode == "register"
    title = "Konto erstellen" if register else "Anmelden"
    eyebrow = "Persönlicher Bereich" if register else "Willkommen zurück"
    switch_href = "/anmelden" if register else "/registrieren"
    switch_label = "Schon registriert? Anmelden" if register else "Noch kein Konto? Jetzt registrieren"
    name_field = ""
    phone_field = ""
    confirm_field = ""
    consent = ""
    if register:
        name_field = f'<label class="field"><span>Name *</span><input name="name" maxlength="120" autocomplete="name" required value="{escape(str(values.get("name", "")))}"></label>'
        phone_field = f'<label class="field"><span>Telefon (optional)</span><input name="telefon" maxlength="60" autocomplete="tel" value="{escape(str(values.get("telefon", "")))}"></label>'
        confirm_field = '<label class="field"><span>Passwort wiederholen *</span><input name="password_confirm" type="password" minlength="10" autocomplete="new-password" required></label>'
        consent = '<label class="consent"><input name="datenschutz" type="checkbox" value="ja" required><span>Ich habe die <a href="/datenschutz" target="_blank">Datenschutzhinweise</a> gelesen und stimme der Kontoverarbeitung zu. *</span></label>'
    password_autocomplete = "new-password" if register else "current-password"
    content = f"""
{_extra_css()}
<section class="auth-card">
  <a class="back-link" href="/">← Zur Bürger-App</a>
  <span class="auth-icon">{icon('people')}</span>
  <span class="eyebrow">{eyebrow}</span>
  <h1>{title}</h1>
  <p>{'Mit einem Konto siehst du deine Meldungen, DGH-Anfragen und Push-Einstellungen an einem Ort.' if register else 'Öffne dein persönliches Profil und verfolge deine Vorgänge.'}</p>
  {_alert(error)}
  <form class="account-form" method="post" action="/{'registrieren' if register else 'anmelden'}">
    <input type="hidden" name="next" value="{escape(next_url)}">
    {name_field}
    <label class="field"><span>E-Mail-Adresse *</span><input name="email" type="email" maxlength="254" autocomplete="email" required value="{escape(str(values.get('email', '')))}"></label>
    {phone_field}
    <label class="field"><span>Passwort *</span><input name="password" type="password" minlength="10" autocomplete="{password_autocomplete}" required></label>
    {confirm_field}
    {consent}
    <button class="primary-button" type="submit">{title}</button>
  </form>
  <a class="account-switch" href="{switch_href}?next={escape(next_url)}">{switch_label}</a>
</section>"""
    return page(title, content, active="profile", body_class="account-view")


def _status_class(status: str) -> str:
    if status in {"Erledigt", "Bestätigt"}:
        return "done"
    if status in {"In Bearbeitung", "Anfrage"}:
        return "progress"
    if status == "Abgelehnt":
        return "rejected"
    return "open"


def _push_toggle(user, field: str, label: str, description: str) -> str:
    checked = " checked" if bool(getattr(user, field, False)) else ""
    return (
        f'<label class="consent switch-row push-pref"><input name="{escape(field)}" type="checkbox" value="ja"{checked}>'
        f'<span><strong>{escape(label)}</strong><small>{escape(description)}</small></span></label>'
    )


def profile_page(user, reports: Iterable, dgh_requests: Iterable, push_enabled: bool, push_configured: bool, message: str = "", error: str = "") -> HTMLResponse:
    report_cards = []
    for item in list(reports)[:20]:
        status = getattr(item, "status", "Offen") or "Offen"
        created = getattr(item, "erstellt_am", None)
        created_text = created.strftime("%d.%m.%Y") if created else ""
        report_cards.append(
            f'<a class="profile-case" href="/meldestatus?ticket={escape(item.ticket)}"><span class="case-icon">{icon("report")}</span><div><small>{escape(created_text)} · {escape(item.ticket)}</small><strong>{escape(item.art or "Meldung")}</strong><span>{escape(item.ort or "")}</span></div><b class="status-pill {_status_class(status)}">{escape(status)}</b></a>'
        )
    if not report_cards:
        report_cards.append('<div class="empty-mini"><strong>Noch keine eigenen Meldungen</strong><span>Neue Meldungen werden nach dem Absenden automatisch hier angezeigt.</span></div>')

    dgh_cards = []
    for item in list(dgh_requests)[:20]:
        status = getattr(item, "status", "Anfrage") or "Anfrage"
        dgh_cards.append(
            f'<article class="profile-case"><span class="case-icon">{icon("building")}</span><div><small>DGH-{item.id:06d} · {escape(item.datum or "")}</small><strong>{escape(item.anlass or "Mietanfrage")}</strong><span>{escape(item.uhrzeit or "Zeit nach Vereinbarung")}</span></div><b class="status-pill {_status_class(status)}">{escape(status)}</b></article>'
        )
    if not dgh_cards:
        dgh_cards.append('<div class="empty-mini"><strong>Noch keine DGH-Anfragen</strong><span>Digitale Mietanfragen erscheinen nach dem Absenden hier.</span></div>')

    push_text = "Auf diesem Konto ist mindestens ein Gerät registriert." if push_enabled else "Aktiviere Benachrichtigungen, um Statusänderungen direkt zu erhalten."
    if not push_configured:
        push_text = "Push ist im Code vorbereitet, auf dem Server fehlen noch die VAPID-Schlüssel."
    push_buttons = '<button class="primary-button" id="enable-push" type="button">Push aktivieren</button><button class="secondary-button" id="disable-push" type="button">Auf diesem Gerät deaktivieren</button>' if push_configured else '<span class="muted">Serverkonfiguration erforderlich</span>'

    push_preferences = f"""
      <div class="push-pref-groups">
        <div class="push-pref-group"><h3>Meine Vorgänge</h3>
          {_push_toggle(user, 'push_meldungen', 'Mängelmeldungen', 'Push bei Statusänderungen deiner eigenen Meldungen.')}
          {_push_toggle(user, 'push_dgh', 'DGH-Anfragen', 'Push bei Zu-, Absage oder anderer Statusänderung deiner DGH-Anfrage.')}
        </div>
        <div class="push-pref-group"><h3>Dorfleben</h3>
          {_push_toggle(user, 'push_veranstaltungen', 'Veranstaltungen', 'Neue und geänderte Termine in Ahnsen.')}
          {_push_toggle(user, 'push_aktuelles', 'Aktuelles aus Ahnsen', 'Neuigkeiten und aktuelle Hinweise aus dem Ort.')}
          {_push_toggle(user, 'push_vereine', 'Vereine & Dorfleben', 'Mitteilungen von Vereinen und zum Dorfleben.')}
        </div>
        <div class="push-pref-group"><h3>Service & Sicherheit</h3>
          {_push_toggle(user, 'push_muell', 'Müllabfuhr', 'Erinnerung am Vortag an die nächste Abholung.')}
          {_push_toggle(user, 'push_buergerinfo', 'Bürgerinformationen', 'Wichtige Informationen der Gemeinde.')}
          {_push_toggle(user, 'push_verkehr', 'Verkehr & Straßensperrungen', 'Sperrungen, Baustellen und wichtige Verkehrshinweise.')}
          {_push_toggle(user, 'push_feuerwehr', 'Feuerwehr & Sicherheit', 'Sicherheitsrelevante Hinweise und Informationen der Feuerwehr.')}
          {_push_toggle(user, 'push_warnungen', 'Wichtige Warnungen', 'Dringende Warn- und Gefahrenhinweise für Ahnsen.')}
        </div>
      </div>
    """

    content = f"""
{_extra_css()}
<style>
.push-settings-title{margin-top:22px}.push-settings-title p{margin:6px 0 0;color:#66736a;line-height:1.5}.push-pref-groups{display:grid;gap:14px}.push-pref-group{padding:15px;border:1px solid #dfe7dc;border-radius:18px;background:#f8faf5}.push-pref-group h3{margin:0 0 10px;font-size:16px}.push-pref{align-items:flex-start!important;margin:7px 0!important;padding:10px!important;border-radius:13px;background:#fff}.push-pref>span{display:grid;gap:3px}.push-pref strong{font-size:14px}.push-pref small{color:#6e786f;line-height:1.35}.push-pref input{margin-top:3px}.profile-settings form{display:grid;gap:12px}
</style>
<section class="profile-hero">
  <div class="profile-avatar">{escape((user.name or 'A')[:1].upper())}</div>
  <div><span class="eyebrow">Mein Ahnsen</span><h1>{escape(user.name)}</h1><p>{escape(user.email)}</p></div>
  <form method="post" action="/abmelden"><button class="secondary-button small-button" type="submit">Abmelden</button></form>
</section>
{_alert(message, success=True)}{_alert(error)}
<section class="profile-grid">
  <article class="content-card profile-settings">
    <div class="section-title"><span class="eyebrow">Kontaktdaten</span><h2>Profil bearbeiten</h2></div>
    <form method="post" action="/profil">
      <label class="field"><span>Name *</span><input name="name" maxlength="120" required value="{escape(user.name or '')}"></label>
      <label class="field"><span>Telefon</span><input name="telefon" maxlength="60" value="{escape(user.telefon or '')}"></label>
      <div class="section-title push-settings-title"><span class="eyebrow">Push-Einstellungen</span><h2>Welche Nachrichten möchtest du?</h2><p>Du entscheidest für jede Kategorie einzeln. Zusätzlich muss Browser-Push auf diesem Gerät aktiviert sein.</p></div>
      {push_preferences}
      <button class="primary-button" type="submit">Profil & Push-Auswahl speichern</button>
    </form>
  </article>
  <article class="content-card push-card">
    <div class="section-title"><span class="eyebrow">Benachrichtigungen</span><h2>Browser-Push</h2></div>
    <p>{escape(push_text)}</p>
    <div class="push-actions">{push_buttons}</div>
    <small id="push-status" aria-live="polite"></small>
  </article>
</section>
<section class="content-card profile-section"><div class="section-title"><span class="eyebrow">Mängelmelder</span><h2>Meine Meldungen</h2></div><div class="profile-list">{''.join(report_cards)}</div><a class="primary-button section-action" href="/mangel-melden">Neuen Mangel melden</a></section>
<section class="content-card profile-section"><div class="section-title"><span class="eyebrow">Dorfgemeinschaftshaus</span><h2>Meine DGH-Anfragen</h2></div><div class="profile-list">{''.join(dgh_cards)}</div><a class="primary-button section-action" href="/dgh-anfrage">Neue Mietanfrage</a></section>
<section class="content-card password-card"><div class="section-title"><span class="eyebrow">Sicherheit</span><h2>Passwort ändern</h2></div><form class="password-form" method="post" action="/profil/passwort"><label class="field"><span>Aktuelles Passwort</span><input name="current_password" type="password" autocomplete="current-password" required></label><label class="field"><span>Neues Passwort</span><input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><label class="field"><span>Wiederholen</span><input name="new_password_confirm" type="password" minlength="10" autocomplete="new-password" required></label><button class="secondary-button" type="submit">Passwort ändern</button></form></section>
"""
    return page("Mein Profil", content, active="profile", body_class="profile-view")


def dgh_overview_page(free_days: Iterable[date], terms: Iterable, logged_in: bool = False) -> HTMLResponse:
    chips = "".join(f'<span>{day.strftime("%d.%m.%Y")}</span>' for day in list(free_days)[:14]) or '<p class="muted">Freie Termine werden derzeit aktualisiert.</p>'
    confirmed = sum(1 for item in terms if getattr(item, "status", "") == "Bestätigt")
    login_note = "Deine Anfrage wird anschließend automatisch in deinem Profil gespeichert." if logged_in else "Du kannst die Anfrage ohne Konto senden; mit Konto kannst du den Status im Profil verfolgen."
    content = f"""
{_extra_css()}
<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfgemeinschaftshaus</span><h1>DGH mieten</h1><p>Prüfe freie Termine und sende deine Anfrage vollständig digital. Erst die Bestätigung der Gemeinde macht die Buchung verbindlich.</p></section>
<section class="info-hero"><span>{icon('building')}</span><div><small>Aktuelle Übersicht</small><strong>{confirmed} bestätigte Belegungen</strong><p>Gelbe Anfragen blockieren den Termin noch nicht.</p></div></section>
<section class="content-card"><div class="section-title"><span class="eyebrow">Nächste Verfügbarkeiten</span><h2>Freie Tage</h2></div><div class="date-chips">{chips}</div></section>
<section class="dgh-request-cta"><div><span class="eyebrow">Direkt online</span><h2>Mietanfrage stellen</h2><p>{escape(login_note)}</p></div><a class="primary-button" href="/dgh-anfrage">Anfrage starten</a></section>"""
    return page("DGH mieten", content, active="calendar")


def dgh_request_page(user=None, error: str = "", values: dict | None = None) -> HTMLResponse:
    values = values or {}
    name = values.get("name", getattr(user, "name", "") if user else "")
    email = values.get("email", getattr(user, "email", "") if user else "")
    telefon = values.get("telefon", getattr(user, "telefon", "") if user else "")
    min_date = date.today().isoformat()
    content = f"""
{_extra_css()}
<section class="page-heading"><a class="back-link" href="/dgh-mieten">← DGH-Kalender</a><span class="eyebrow">Digitale Mietanfrage</span><h1>DGH anfragen</h1><p>Die Anfrage wird im Verwaltungsbereich geprüft. Du erhältst erst nach Bestätigung eine verbindliche Zusage.</p></section>
{_alert(error)}
<form class="report-form" method="post" action="/api/dgh-anfragen" novalidate>
<section class="form-section"><div class="section-number">1</div><div class="section-copy"><h2>Termin und Anlass</h2><p>Wähle deinen Wunschtermin und beschreibe die Veranstaltung.</p></div><div class="two-columns full"><label class="field"><span>Datum *</span><input name="datum" type="date" min="{min_date}" required value="{escape(str(values.get('datum', '')))}"></label><label class="field"><span>Uhrzeit *</span><input name="uhrzeit" maxlength="40" required placeholder="z. B. 18:00 Uhr" value="{escape(str(values.get('uhrzeit', '')))}"></label></div><label class="field full"><span>Anlass *</span><input name="anlass" maxlength="160" required placeholder="z. B. Geburtstag, Versammlung oder Feier" value="{escape(str(values.get('anlass', '')))}"></label></section>
<section class="form-section"><div class="section-number">2</div><div class="section-copy"><h2>Kontaktdaten</h2><p>Diese Angaben werden für Rückfragen und die Zu- oder Absage benötigt.</p></div><div class="two-columns full"><label class="field"><span>Name *</span><input name="name" maxlength="120" autocomplete="name" required value="{escape(str(name))}"></label><label class="field"><span>Telefon *</span><input name="telefon" maxlength="60" autocomplete="tel" required value="{escape(str(telefon))}"></label></div><label class="field full"><span>E-Mail *</span><input name="email" type="email" maxlength="254" autocomplete="email" required value="{escape(str(email))}"></label></section>
<section class="form-section"><div class="section-number">3</div><div class="section-copy"><h2>Weitere Angaben</h2><p>Zusätzliche Informationen helfen bei der Prüfung.</p></div><label class="field full"><span>Bemerkung</span><textarea name="kommentar" maxlength="1500" placeholder="Personenzahl, Aufbauzeiten oder weitere Hinweise">{escape(str(values.get('kommentar', '')))}</textarea></label><label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent full"><input name="datenschutz" type="checkbox" value="ja" required><span>Ich habe die <a href="/datenschutz" target="_blank">Datenschutzhinweise</a> gelesen und stimme der Verarbeitung dieser Anfrage zu. *</span></label></section>
<button class="primary-button submit-button" type="submit">{icon('check')} Mietanfrage verbindlich absenden</button><p class="form-footnote">Das Absenden ist noch keine Buchungsbestätigung.</p></form>"""
    return page("DGH anfragen", content, active="calendar")


def dgh_success_page(item, logged_in: bool) -> HTMLResponse:
    profile_button = '<a class="primary-button" href="/profil">Im Profil verfolgen</a>' if logged_in else '<a class="primary-button" href="/registrieren?next=/profil">Konto für künftige Vorgänge erstellen</a>'
    content = f"""
{_extra_css()}
<section class="success-card"><span class="success-icon">{icon('check')}</span><span class="eyebrow">Anfrage erfolgreich übermittelt</span><h1>Dein Wunschtermin wird geprüft.</h1><p>Die Gemeinde meldet sich über deine angegebenen Kontaktdaten. Bis zur Bestätigung ist der Termin nicht verbindlich reserviert.</p><div class="ticket-box"><small>Referenz</small><strong>DGH-{item.id:06d}</strong></div><dl class="success-details"><div><dt>Datum</dt><dd>{escape(item.datum or '')}</dd></div><div><dt>Status</dt><dd>{escape(item.status or 'Anfrage')}</dd></div></dl><div class="button-stack">{profile_button}<a class="secondary-button" href="/dgh-mieten">Zum DGH-Kalender</a></div></section>"""
    return page("DGH-Anfrage gesendet", content, active="calendar")
