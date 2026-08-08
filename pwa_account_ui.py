from __future__ import annotations

import calendar
from datetime import date, datetime
from html import escape
from typing import Iterable

from fastapi.responses import HTMLResponse

from pwa_ui import icon, page


DGH_MONTH_NAMES = (
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)

DGH_CALENDAR_CSS = """
<style>
.dgh-calendar-card{overflow:hidden;padding:0}.dgh-calendar-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 20px 16px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#fff,#f4f8f1)}.dgh-calendar-title h2{margin:5px 0 0;font-size:28px}.dgh-calendar-title p{margin:6px 0 0;color:var(--muted);font-size:13px;line-height:1.45}.dgh-calendar-nav{display:flex;align-items:center;gap:8px}.dgh-calendar-nav button{width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--line);border-radius:14px;color:var(--forest);background:#fff;font-size:20px;font-weight:900;cursor:pointer}.dgh-calendar-nav button:hover{background:var(--soft)}.dgh-calendar-nav button:disabled{opacity:.35;cursor:not-allowed}.dgh-today-button{width:auto!important;padding:0 13px!important;font-size:12px!important}.dgh-calendar-legend{display:flex;flex-wrap:wrap;gap:8px;padding:14px 20px;border-bottom:1px solid var(--line);background:#fff}.dgh-calendar-legend span{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:#f7f8f4;color:#556158;font-size:11px;font-weight:850}.dgh-calendar-legend i{width:11px;height:11px;border-radius:4px}.dgh-calendar-legend .free{background:#dff3e3}.dgh-calendar-legend .request{background:#ffe7a7}.dgh-calendar-legend .booked{background:#f4b6b0}.dgh-calendar-legend .today{background:#fff;border:2px solid var(--forest)}.dgh-calendar-body{padding:18px 20px 22px;background:#fff}.dgh-month-panel[hidden]{display:none!important}.dgh-month-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:14px}.dgh-month-heading h3{margin:0;font-size:25px;letter-spacing:-.03em}.dgh-month-heading span{color:var(--muted);font-size:12px;font-weight:800}.dgh-weekdays,.dgh-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.dgh-weekdays{margin-bottom:7px}.dgh-weekdays span{padding:5px 0;color:var(--muted);font-size:10px;font-weight:900;text-align:center;text-transform:uppercase}.dgh-day{min-height:62px;position:relative;display:flex;align-items:flex-start;justify-content:flex-end;padding:7px;border:1px solid #e5e9e1;border-radius:15px;background:#fafbf8;color:#35443b;font-weight:900;text-decoration:none;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}.dgh-day:not(.empty):not(.past):hover{transform:translateY(-1px);box-shadow:0 7px 16px rgba(25,64,45,.09)}.dgh-day.empty{border-color:transparent;background:transparent}.dgh-day.past{color:#a8aea9;background:#f3f4f1}.dgh-day.free{border-color:#c9e5d0;background:linear-gradient(145deg,#f4fbf5,#e8f6eb)}.dgh-day.request{border-color:#eed38b;background:linear-gradient(145deg,#fff9e9,#ffefbd);color:#7a5812}.dgh-day.booked{border-color:#e7aba6;background:linear-gradient(145deg,#fff1ef,#f8d2ce);color:#8f312b}.dgh-day.is-today{box-shadow:inset 0 0 0 2px var(--forest)}.dgh-day-number{font-size:15px;line-height:1}.dgh-day-state{position:absolute;left:7px;right:7px;bottom:7px;overflow:hidden;text-overflow:ellipsis;color:inherit;font-size:8px;font-weight:850;letter-spacing:.02em;white-space:nowrap}.dgh-calendar-note{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:12px 13px;border-radius:15px;background:#f5f8f3;color:#59665d;font-size:12px;line-height:1.45}.dgh-calendar-note strong{color:var(--forest)}.dgh-date-prefill{margin-top:8px;color:var(--forest);font-size:12px;font-weight:850}
@media(max-width:720px){.dgh-calendar-top{align-items:flex-start;flex-direction:column}.dgh-calendar-nav{width:100%;justify-content:space-between}.dgh-calendar-nav .dgh-today-button{flex:1}.dgh-calendar-body{padding:14px 12px 18px}.dgh-weekdays,.dgh-month-grid{gap:4px}.dgh-day{min-height:51px;padding:6px;border-radius:12px}.dgh-day-number{font-size:13px}.dgh-day-state{left:5px;right:5px;bottom:5px;font-size:7px}.dgh-calendar-legend{padding-left:12px;padding-right:12px}.dgh-calendar-title h2{font-size:24px}}
@media(max-width:390px){.dgh-day{min-height:46px}.dgh-day-state{display:none}.dgh-weekdays span{font-size:9px}.dgh-calendar-nav button{width:39px;height:39px}}
</style>
"""

DGH_CALENDAR_SCRIPT = """
<script>
(() => {
  const root = document.querySelector('[data-dgh-calendar]');
  if (!root) return;
  const panels = [...root.querySelectorAll('[data-dgh-month]')];
  const label = root.querySelector('[data-dgh-month-label]');
  const previous = root.querySelector('[data-dgh-prev]');
  const next = root.querySelector('[data-dgh-next]');
  const today = root.querySelector('[data-dgh-today]');
  let index = 0;
  const show = value => {
    index = Math.max(0, Math.min(value, panels.length - 1));
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    if (label) label.textContent = panels[index]?.dataset.label || '';
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === panels.length - 1;
  };
  previous?.addEventListener('click', () => show(index - 1));
  next?.addEventListener('click', () => show(index + 1));
  today?.addEventListener('click', () => show(0));
  show(0);
})();
</script>
"""

DGH_REQUEST_PREFILL_SCRIPT = """
<script>
(() => {
  const input = document.getElementById('dgh-date-input');
  if (!input || input.value) return;
  const requested = new URLSearchParams(window.location.search).get('datum') || '';
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(requested) && requested >= input.min) {
    input.value = requested;
    const note = document.getElementById('dgh-date-prefill');
    if (note) note.textContent = 'Wunschdatum aus dem Kalender übernommen.';
  }
})();
</script>
"""


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
    from community_crud import count_unread_messages, get_preference
    reports = list(reports)
    dgh_requests = list(dgh_requests)
    preference = get_preference(user.id)
    unread_messages = count_unread_messages(user.id)
    report_cards = []
    for item in reports[:20]:
        status = getattr(item, "status", "Offen") or "Offen"
        created = getattr(item, "erstellt_am", None)
        created_text = created.strftime("%d.%m.%Y") if created else ""
        report_cards.append(
            f'<a class="profile-case" href="/meldestatus?ticket={escape(item.ticket)}"><span class="case-icon">{icon("report")}</span><div><small>{escape(created_text)} · {escape(item.ticket)}</small><strong>{escape(item.art or "Meldung")}</strong><span>{escape(item.ort or "")}</span></div><b class="status-pill {_status_class(status)}">{escape(status)}</b></a>'
        )
    if not report_cards:
        report_cards.append('<div class="empty-mini"><strong>Noch keine eigenen Meldungen</strong><span>Neue Meldungen werden nach dem Absenden automatisch hier angezeigt.</span></div>')

    dgh_cards = []
    for item in dgh_requests[:20]:
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

    warn_min_level = max(1, min(int(getattr(user, "warn_min_level", 2) or 2), 4))
    warn_level_options = "".join(
        f'<option value="{level}"{" selected" if warn_min_level == level else ""}>{label}</option>'
        for level, label in ((1, "Alle Warnstufen"), (2, "Ab Stufe 2 · wichtige Warnungen"), (3, "Ab Stufe 3 · Unwetter / ernste Gefahr"), (4, "Nur Stufe 4 · extreme Gefahr"))
    )

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
        <div class="push-pref-group"><h3>Amtliche Warnungen</h3>
          {_push_toggle(user, 'push_unwetter', 'Wetter & Unwetter (DWD)', 'Gewitter, Starkregen, Sturm, Hagel, Glätte und weitere amtliche Wetterwarnungen.')}
          {_push_toggle(user, 'push_bevoelkerungsschutz', 'Bevölkerungsschutz', 'Amtliche Gefahrenmeldungen z. B. zu Großbränden, Rauch, Gefahrstoffen oder Infrastruktur.')}
          {_push_toggle(user, 'push_hochwasser', 'Hochwasser & Überflutung', 'Passende amtliche Hochwasser- und Überflutungswarnungen aus den angebundenen Quellen.')}
          <label class="field"><span>Mindest-Warnstufe</span><select name="warn_min_level">{warn_level_options}</select><small>Standard ist Stufe 2. Entwarnungen werden unabhängig davon zugestellt, wenn die Kategorie aktiviert ist.</small></label>
          <a class="secondary-button" href="/warnungen">Aktuelle Warnlage ansehen</a>
        </div>
        <div class="push-pref-group"><h3>Service & Sicherheit</h3>
          {_push_toggle(user, 'push_muell', 'Müllabfuhr', 'Erinnerung am Vortag an die nächste Abholung.')}
          {_push_toggle(user, 'push_buergerinfo', 'Bürgerinformationen', 'Wichtige Informationen der Gemeinde.')}
          {_push_toggle(user, 'push_verkehr', 'Verkehr & Straßensperrungen', 'Sperrungen, Baustellen und wichtige Verkehrshinweise.')}
          {_push_toggle(user, 'push_feuerwehr', 'Feuerwehr & Sicherheit', 'Sicherheitsrelevante Hinweise und Informationen der Feuerwehr.')}
          {_push_toggle(user, 'push_warnungen', 'Wichtige Hinweise der Verwaltung', 'Manuelle dringende Hinweise, die die Verwaltung über Ahnsen hilft versendet.')}
        </div>
      </div>
    """

    content = f"""
{_extra_css()}
<style>
.push-settings-title{{margin-top:22px}}.push-settings-title p{{margin:6px 0 0;color:#66736a;line-height:1.5}}.push-pref-groups{{display:grid;gap:14px}}.push-pref-group{{padding:15px;border:1px solid #dfe7dc;border-radius:18px;background:#f8faf5}}.push-pref-group h3{{margin:0 0 10px;font-size:16px}}.push-pref{{align-items:flex-start!important;margin:7px 0!important;padding:10px!important;border-radius:13px;background:#fff}}.push-pref>span{{display:grid;gap:3px}}.push-pref strong{{font-size:14px}}.push-pref small{{color:#6e786f;line-height:1.35}}.push-pref input{{margin-top:3px}}.profile-settings form{{display:grid;gap:12px}}
</style>
<section class="profile-hero">
  <div class="profile-avatar">{escape((user.name or 'A')[:1].upper())}</div>
  <div><span class="eyebrow">Mein Ahnsen</span><h1>{escape(user.name)}</h1><p>{escape(user.email)}</p></div>
  <form method="post" action="/abmelden"><button class="secondary-button small-button" type="submit">Abmelden</button></form>
</section>
{_alert(message, success=True)}{_alert(error)}
<section class="profile-overview-links">
  <a class="profile-overview-link" href="/nachrichten"><span class="eyebrow">Postfach</span><strong>{unread_messages}</strong><span>ungelesene Nachrichten</span></a>
  <a class="profile-overview-link" href="#meine-meldungen"><span class="eyebrow">Mängel</span><strong>{len(reports)}</strong><span>eigene Meldungen</span></a>
  <a class="profile-overview-link" href="#meine-dgh"><span class="eyebrow">DGH</span><strong>{len(dgh_requests)}</strong><span>eigene Anfragen</span></a>
  <a class="profile-overview-link" href="/ideen"><span class="eyebrow">Beteiligung</span><strong>Ideen</strong><span>mitmachen & unterstützen</span></a>
  <a class="profile-overview-link" href="/nachbarschaft"><span class="eyebrow">Dorf</span><strong>Hilfe</strong><span>Nachbarschaftshilfe</span></a>
</section>
<section class="profile-grid">
  <article class="content-card profile-settings">
    <div class="section-title"><span class="eyebrow">Kontaktdaten</span><h2>Profil bearbeiten</h2></div>
    <form method="post" action="/profil">
      <label class="field"><span>Name *</span><input name="name" maxlength="120" required value="{escape(user.name or '')}"></label>
      <label class="field"><span>Telefon</span><input name="telefon" maxlength="60" value="{escape(user.telefon or '')}"></label>
      <div class="section-title push-settings-title"><span class="eyebrow">Push-Einstellungen</span><h2>Welche Nachrichten möchtest du?</h2><p>Du entscheidest für jede Kategorie einzeln. Zusätzlich muss Browser-Push auf diesem Gerät aktiviert sein.</p></div>
      {push_preferences}
      <div class="smart-push-box"><h3>Intelligente Benachrichtigungen</h3><p>Dringende Warnungen und Status deiner eigenen Vorgänge kommen immer sofort. Für normale Dorfmeldungen kannst du sofortige Zustellung oder eine gebündelte Zusammenfassung wählen.</p><div class="smart-push-grid"><label class="field"><span>Zustellung normaler Hinweise</span><select name="push_mode"><option value="sofort"{" selected" if getattr(preference,"push_mode","sofort") == "sofort" else ""}>Sofort</option><option value="taeglich"{" selected" if getattr(preference,"push_mode","") == "taeglich" else ""}>Tägliche Zusammenfassung</option><option value="woechentlich"{" selected" if getattr(preference,"push_mode","") == "woechentlich" else ""}>Wöchentliche Zusammenfassung</option></select></label><label class="field"><span>Uhrzeit Zusammenfassung</span><input name="digest_hour" type="number" min="0" max="23" value="{getattr(preference,"digest_hour",18)}"></label><label class="field"><span>Ruhezeit ab</span><input name="quiet_start" type="time" value="{escape(getattr(preference,"quiet_start","22:00"))}"></label><label class="field"><span>Ruhezeit bis</span><input name="quiet_end" type="time" value="{escape(getattr(preference,"quiet_end","07:00"))}"></label><input type="hidden" name="language" value="{escape(getattr(preference,"language","de"))}"></div></div>
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
<section class="content-card profile-section" id="meine-meldungen"><div class="section-title"><span class="eyebrow">Mängelmelder</span><h2>Meine Meldungen</h2></div><div class="profile-list">{''.join(report_cards)}</div><a class="primary-button section-action" href="/mangel-melden">Neuen Mangel melden</a></section>
<section class="content-card profile-section" id="meine-dgh"><div class="section-title"><span class="eyebrow">Dorfgemeinschaftshaus</span><h2>Meine DGH-Anfragen</h2></div><div class="profile-list">{''.join(dgh_cards)}</div><a class="primary-button section-action" href="/dgh-anfrage">Neue Mietanfrage</a></section>
<section class="content-card password-card"><div class="section-title"><span class="eyebrow">Sicherheit</span><h2>Passwort ändern</h2></div><form class="password-form" method="post" action="/profil/passwort"><label class="field"><span>Aktuelles Passwort</span><input name="current_password" type="password" autocomplete="current-password" required></label><label class="field"><span>Neues Passwort</span><input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><label class="field"><span>Wiederholen</span><input name="new_password_confirm" type="password" minlength="10" autocomplete="new-password" required></label><button class="secondary-button" type="submit">Passwort ändern</button></form></section>
"""
    return page("Mein Profil", content, active="profile", body_class="profile-view")


def _parse_dgh_date(value: str):
    try:
        return datetime.strptime(str(value or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def _dgh_months(start: date, count: int = 12):
    year, month = start.year, start.month
    for index in range(count):
        yield index, year, month
        month += 1
        if month > 12:
            month = 1
            year += 1


def dgh_overview_page(free_days: Iterable[date], terms: Iterable, logged_in: bool = False) -> HTMLResponse:
    today = date.today()
    terms = list(terms)
    availability = {}

    for item in terms:
        if getattr(item, "aktiv", "Ja") != "Ja":
            continue
        item_date = _parse_dgh_date(getattr(item, "datum", ""))
        if not item_date or item_date < today:
            continue
        status = getattr(item, "status", "") or ""
        if status == "Bestätigt":
            availability[item_date] = "booked"
        elif status == "Anfrage":
            if availability.get(item_date) != "booked":
                availability[item_date] = "request"

    calendar_engine = calendar.Calendar(firstweekday=0)
    panels = []
    for index, year, month in _dgh_months(today, 12):
        cells = []
        for week in calendar_engine.monthdayscalendar(year, month):
            for day_number in week:
                if not day_number:
                    cells.append('<span class="dgh-day empty" aria-hidden="true"></span>')
                    continue
                current = date(year, month, day_number)
                iso = current.isoformat()
                weekend = " weekend" if current.weekday() >= 5 else ""
                is_today = " is-today" if current == today else ""
                state = availability.get(current, "free")
                number = f'<span class="dgh-day-number">{day_number}</span>'

                if current < today:
                    cells.append(f'<span class="dgh-day past{weekend}">{number}</span>')
                elif state == "booked":
                    cells.append(
                        f'<span class="dgh-day booked{weekend}{is_today}" title="Belegt" aria-label="{day_number}. {DGH_MONTH_NAMES[month - 1]} {year}: belegt">{number}<span class="dgh-day-state">Belegt</span></span>'
                    )
                elif state == "request":
                    cells.append(
                        f'<a class="dgh-day request{weekend}{is_today}" href="/dgh-anfrage?datum={iso}" title="Anfrage läuft – weitere Anfrage möglich" aria-label="{day_number}. {DGH_MONTH_NAMES[month - 1]} {year}: Anfrage läuft, weitere Anfrage möglich">{number}<span class="dgh-day-state">Anfrage</span></a>'
                    )
                else:
                    cells.append(
                        f'<a class="dgh-day free{weekend}{is_today}" href="/dgh-anfrage?datum={iso}" title="Frei – Termin anfragen" aria-label="{day_number}. {DGH_MONTH_NAMES[month - 1]} {year}: frei, Termin anfragen">{number}<span class="dgh-day-state">Frei</span></a>'
                    )

        label = f"{DGH_MONTH_NAMES[month - 1]} {year}"
        hidden = "" if index == 0 else " hidden"
        panels.append(
            f'<section class="dgh-month-panel" data-dgh-month="{index}" data-label="{label}"{hidden}>'
            f'<div class="dgh-month-heading"><h3>{label}</h3><span>Verfügbarkeit DGH Ahnsen</span></div>'
            '<div class="dgh-weekdays"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>'
            f'<div class="dgh-month-grid">{"".join(cells)}</div></section>'
        )

    login_note = "Deine Anfrage wird anschließend automatisch in deinem Profil gespeichert." if logged_in else "Du kannst die Anfrage ohne Konto senden; mit Konto kannst du den Status im Profil verfolgen."
    first_label = f"{DGH_MONTH_NAMES[today.month - 1]} {today.year}"
    content = f"""
{_extra_css()}
{DGH_CALENDAR_CSS}
<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfgemeinschaftshaus</span><h1>DGH mieten</h1><p>Sieh auf einen Blick, welche Tage frei, angefragt oder bereits verbindlich belegt sind. Freie Tage kannst du direkt aus dem Kalender anfragen.</p></section>
<section class="content-card dgh-calendar-card" data-dgh-calendar>
  <div class="dgh-calendar-top"><div class="dgh-calendar-title"><span class="eyebrow">Belegungskalender</span><h2 data-dgh-month-label aria-live="polite">{first_label}</h2><p>Tippe auf einen freien oder gelben Tag, um ihn direkt in die Mietanfrage zu übernehmen.</p></div><div class="dgh-calendar-nav"><button type="button" data-dgh-prev aria-label="Vorheriger Monat">‹</button><button class="dgh-today-button" type="button" data-dgh-today>Heute</button><button type="button" data-dgh-next aria-label="Nächster Monat">›</button></div></div>
  <div class="dgh-calendar-legend"><span><i class="free"></i>Frei</span><span><i class="request"></i>Anfrage läuft</span><span><i class="booked"></i>Belegt / blockiert</span><span><i class="today"></i>Heute</span></div>
  <div class="dgh-calendar-body">{''.join(panels)}<div class="dgh-calendar-note"><span>ℹ️</span><div><strong>Datenschutz:</strong> Im öffentlichen Kalender werden nur Verfügbarkeiten angezeigt – keine Namen, Anlässe oder Kontaktdaten bestehender Buchungen.</div></div></div>
</section>
<section class="dgh-request-cta"><div><span class="eyebrow">Direkt online</span><h2>Mietanfrage stellen</h2><p>{escape(login_note)}</p></div><a class="primary-button" href="/dgh-anfrage">Anfrage starten</a></section>
{DGH_CALENDAR_SCRIPT}"""
    return page("DGH mieten", content, active="calendar")


def dgh_request_page(user=None, error: str = "", values: dict | None = None) -> HTMLResponse:
    values = values or {}
    name = values.get("name", getattr(user, "name", "") if user else "")
    email = values.get("email", getattr(user, "email", "") if user else "")
    telefon = values.get("telefon", getattr(user, "telefon", "") if user else "")
    min_date = date.today().isoformat()
    content = f"""
{_extra_css()}
{DGH_CALENDAR_CSS}
<section class="page-heading"><a class="back-link" href="/dgh-mieten">← DGH-Kalender</a><span class="eyebrow">Digitale Mietanfrage</span><h1>DGH anfragen</h1><p>Die Anfrage wird im Verwaltungsbereich geprüft. Du erhältst erst nach Bestätigung eine verbindliche Zusage.</p></section>
{_alert(error)}
<form class="report-form" method="post" action="/api/dgh-anfragen" novalidate>
<section class="form-section"><div class="section-number">1</div><div class="section-copy"><h2>Termin und Anlass</h2><p>Wähle deinen Wunschtermin und beschreibe die Veranstaltung.</p></div><div class="two-columns full"><label class="field"><span>Datum *</span><input id="dgh-date-input" name="datum" type="date" min="{min_date}" required value="{escape(str(values.get('datum', '')))}"><small class="dgh-date-prefill" id="dgh-date-prefill"></small></label><label class="field"><span>Uhrzeit *</span><input name="uhrzeit" maxlength="40" required placeholder="z. B. 18:00 Uhr" value="{escape(str(values.get('uhrzeit', '')))}"></label></div><label class="field full"><span>Anlass *</span><input name="anlass" maxlength="160" required placeholder="z. B. Geburtstag, Versammlung oder Feier" value="{escape(str(values.get('anlass', '')))}"></label></section>
<section class="form-section"><div class="section-number">2</div><div class="section-copy"><h2>Kontaktdaten</h2><p>Diese Angaben werden für Rückfragen und die Zu- oder Absage benötigt.</p></div><div class="two-columns full"><label class="field"><span>Name *</span><input name="name" maxlength="120" autocomplete="name" required value="{escape(str(name))}"></label><label class="field"><span>Telefon *</span><input name="telefon" maxlength="60" autocomplete="tel" required value="{escape(str(telefon))}"></label></div><label class="field full"><span>E-Mail *</span><input name="email" type="email" maxlength="254" autocomplete="email" required value="{escape(str(email))}"></label></section>
<section class="form-section"><div class="section-number">3</div><div class="section-copy"><h2>Weitere Angaben</h2><p>Zusätzliche Informationen helfen bei der Prüfung.</p></div><label class="field full"><span>Bemerkung</span><textarea name="kommentar" maxlength="1500" placeholder="Personenzahl, Aufbauzeiten oder weitere Hinweise">{escape(str(values.get('kommentar', '')))}</textarea></label><label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent full"><input name="datenschutz" type="checkbox" value="ja" required><span>Ich habe die <a href="/datenschutz" target="_blank">Datenschutzhinweise</a> gelesen und stimme der Verarbeitung dieser Anfrage zu. *</span></label></section>
<button class="primary-button submit-button" type="submit">{icon('check')} Mietanfrage verbindlich absenden</button><p class="form-footnote">Das Absenden ist noch keine Buchungsbestätigung.</p></form>
{DGH_REQUEST_PREFILL_SCRIPT}"""
    return page("DGH anfragen", content, active="calendar")


def dgh_success_page(item, logged_in: bool) -> HTMLResponse:
    profile_button = '<a class="primary-button" href="/profil">Im Profil verfolgen</a>' if logged_in else '<a class="primary-button" href="/registrieren?next=/profil">Konto für künftige Vorgänge erstellen</a>'
    content = f"""
{_extra_css()}
<section class="success-card"><span class="success-icon">{icon('check')}</span><span class="eyebrow">Anfrage erfolgreich übermittelt</span><h1>Dein Wunschtermin wird geprüft.</h1><p>Die Gemeinde meldet sich über deine angegebenen Kontaktdaten. Bis zur Bestätigung ist der Termin nicht verbindlich reserviert.</p><div class="ticket-box"><small>Referenz</small><strong>DGH-{item.id:06d}</strong></div><dl class="success-details"><div><dt>Datum</dt><dd>{escape(item.datum or '')}</dd></div><div><dt>Status</dt><dd>{escape(item.status or 'Anfrage')}</dd></div></dl><div class="button-stack">{profile_button}<a class="secondary-button" href="/dgh-mieten">Zum DGH-Kalender</a></div></section>"""
    return page("DGH-Anfrage gesendet", content, active="calendar")
