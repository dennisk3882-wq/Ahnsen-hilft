from __future__ import annotations

from datetime import date
from html import escape

from fastapi import APIRouter, HTTPException, Request

from muelltermine_crud import get_naechste_muelltermine
from muelltermine_texte import formatiere_abfuhrarten
from pwa_core import _current_user
from pwa_crud import has_push_subscription
from pwa_ui import icon, page
from push_service import push_configured
from waste_preferences import (
    ALLOWED_WASTE_REMINDER_TIMES,
    get_waste_reminder_time,
    set_waste_push_setting,
)


router = APIRouter()

WEEKDAYS = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")
MONTHS = (
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)
MONTHS_SHORT = ("JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ")
KIND_ORDER = ("Restabfall", "Bioabfall", "Sommerbiotonne", "Leichtverpackungen", "Altpapier")

BELL_SVG = """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>"""
CALENDAR_SVG = """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>"""


def _full_date(value: date | None) -> str:
    if not isinstance(value, date):
        return "Termin"
    return f"{WEEKDAYS[value.weekday()]}, {value.day}. {MONTHS[value.month - 1]} {value.year}"


def _relative(value: date | None) -> str:
    if not isinstance(value, date):
        return ""
    days = (value - date.today()).days
    if days == 0:
        return "heute"
    if days == 1:
        return "morgen"
    if days > 1:
        return f"in {days} Tagen"
    return ""


def _raw_kinds(item) -> list[str]:
    return [part.strip() for part in str(getattr(item, "abfuhrarten", "") or "").split(",") if part.strip()]


def _kind_labels(item) -> list[str]:
    labels = formatiere_abfuhrarten(getattr(item, "abfuhrarten", ""), mit_symbol=False)
    return labels or ["Müllabfuhr"]


def _kind_token(value: str) -> str:
    return "".join(ch for ch in str(value or "").casefold() if ch.isalnum())


def _kind_tone(item) -> str:
    kinds = {kind.casefold() for kind in _raw_kinds(item)}
    if "altpapier" in kinds:
        return "paper"
    if "leichtverpackungen" in kinds:
        return "yellow"
    if "bioabfall" in kinds or "sommerbiotonne" in kinds:
        return "bio"
    if "restabfall" in kinds:
        return "rest"
    return "neutral"


def _kind_badges(item) -> str:
    return "".join(f'<span>{escape(label)}</span>' for label in _kind_labels(item))


def _term_card(item, *, compact: bool = True) -> str:
    value = getattr(item, "datum", None)
    tone = _kind_tone(item)
    raw_kinds = _raw_kinds(item)
    tokens = "|".join(_kind_token(kind) for kind in raw_kinds)
    labels = " · ".join(_kind_labels(item))
    holiday = getattr(item, "feiertagsabweichung", "") == "Ja"
    holiday_badge = '<span class="waste-shift-badge">Feiertagsverschiebung</span>' if holiday else ""
    if isinstance(value, date):
        date_box = f'<div class="waste-date-box"><strong>{value.day:02d}</strong><small>{MONTHS_SHORT[value.month - 1]}</small></div>'
    else:
        date_box = '<div class="waste-date-box"><strong>--</strong><small>---</small></div>'
    cls = "waste-term-card compact" if compact else "waste-term-card"
    return (
        f'<article class="{cls} tone-{tone}" data-waste-term data-kinds="{escape(tokens, quote=True)}">'
        f'{date_box}<div class="waste-term-copy"><strong>{escape(labels)}</strong>'
        f'<span>{escape(_full_date(value))}</span><small>{escape(_relative(value)) or "kommender Termin"}</small>{holiday_badge}</div>'
        f'</article>'
    )


def _push_panel(user, push_available: bool, subscription_exists: bool, reminder_time: str) -> str:
    if not user:
        return f"""
        <section class="waste-push-card" id="muell-erinnern">
          <div class="waste-push-icon">{BELL_SVG}</div>
          <div class="waste-push-copy">
            <span class="eyebrow">Erinnerungsservice</span>
            <h2>Nie wieder die Tonne vergessen</h2>
            <p>Mit einem kostenlosen Bürgerkonto kannst du dich automatisch per Push an die nächste Abfuhr erinnern lassen.</p>
          </div>
          <div class="waste-push-controls single">
            <a class="waste-push-button" href="/anmelden?next=/muelltermine-info">Anmelden & Erinnerungen aktivieren</a>
          </div>
        </section>"""

    enabled = bool(getattr(user, "push_muell", False))
    if not push_available:
        return f"""
        <section class="waste-push-card" id="muell-erinnern">
          <div class="waste-push-icon">{BELL_SVG}</div>
          <div class="waste-push-copy"><span class="eyebrow">Erinnerungsservice</span><h2>Nie wieder die Tonne vergessen</h2><p>Die Auswahl ist vorbereitet. Push ist auf dem Server momentan jedoch nicht freigeschaltet.</p></div>
          <div class="waste-push-controls single"><button class="waste-push-button" type="button" disabled>Push derzeit nicht verfügbar</button></div>
        </section>"""

    options = "".join(
        f'<option value="{value}"{" selected" if value == reminder_time else ""}>{escape(label)}</option>'
        for value, label in ALLOWED_WASTE_REMINDER_TIMES.items()
    )
    status = (
        f'Erinnerungen sind aktiv · {ALLOWED_WASTE_REMINDER_TIMES[reminder_time]}.'
        if enabled and subscription_exists
        else "Erinnerungen sind aktiviert. Prüfe auf diesem Gerät noch die Push-Freigabe."
        if enabled
        else "Noch nicht aktiviert. Du kannst die Erinnerung jederzeit wieder ausschalten."
    )
    button = "✓ Erinnerungen aktiv" if enabled and subscription_exists else "Push auf diesem Gerät aktivieren" if enabled else "Erinnerungen aktivieren"
    return f"""
    <section class="waste-push-card" id="muell-erinnern" data-enabled="{'true' if enabled else 'false'}">
      <div class="waste-push-icon">{BELL_SVG}</div>
      <div class="waste-push-copy">
        <span class="eyebrow">Erinnerungsservice</span>
        <h2>Nie wieder die Tonne vergessen</h2>
        <p>Ahnsen hilft erinnert dich nur dann, wenn tatsächlich eine Abholung ansteht. Du bestimmst den Zeitpunkt selbst.</p>
      </div>
      <div class="waste-push-controls">
        <label class="waste-reminder-select"><span>Wann möchtest du erinnert werden?</span><select id="waste-reminder-time">{options}</select></label>
        <button class="waste-push-button{' active' if enabled else ''}" id="waste-push-toggle" type="button">{button}</button>
      </div>
      <small class="waste-push-status" id="waste-push-status" aria-live="polite">{escape(status)}</small>
    </section>"""


def render_waste_center(terms, user=None, *, subscription_exists: bool = False, push_available: bool = False):
    terms = list(terms or [])[:24]
    reminder_time = get_waste_reminder_time(getattr(user, "id", None))
    enabled = bool(user and getattr(user, "push_muell", False))

    if terms:
        first = terms[0]
        first_date = getattr(first, "datum", None)
        first_labels = _kind_labels(first)
        first_title = " · ".join(first_labels)
        first_badges = _kind_badges(first)
        first_shift = (
            '<div class="waste-holiday-note"><strong>Achtung</strong><span>Dieser Termin ist wegen eines Feiertags verschoben.</span></div>'
            if getattr(first, "feiertagsabweichung", "") == "Ja" else ""
        )
        hero = f"""
        <section class="waste-next tone-{_kind_tone(first)}">
          <div class="waste-next-icon">{icon('waste')}</div>
          <div class="waste-next-copy">
            <span class="eyebrow">Nächste Abfuhr · {escape(_relative(first_date) or 'demnächst')}</span>
            <h2>{escape(first_title)}</h2>
            <p>{escape(_full_date(first_date))}</p>
            <div class="waste-kind-badges">{first_badges}</div>
          </div>
          {first_shift}
        </section>"""
    else:
        hero = '<section class="waste-empty"><span>♻</span><h2>Noch keine kommenden Termine</h2><p>Der Abfallkalender wird derzeit aktualisiert.</p></section>'

    action_push_label = "Erinnerung aktiv" if enabled else "Erinnern lassen"
    actions = f"""
    <section class="waste-actions">
      <a class="waste-action-card" href="#muell-erinnern"><span class="waste-action-icon">{BELL_SVG}</span><div><strong>{action_push_label}</strong><small>Push-Nachricht automatisch</small></div><b>›</b></a>
      <a class="waste-action-card" href="/muelltermine.ics"><span class="waste-action-icon">{CALENDAR_SVG}</span><div><strong>Kalender</strong><small>ICS-Datei hinzufügen</small></div><b>›</b></a>
    </section>"""

    kinds_seen = []
    for item in terms:
        for kind in _raw_kinds(item):
            if kind not in kinds_seen:
                kinds_seen.append(kind)
    kinds_seen.sort(key=lambda value: KIND_ORDER.index(value) if value in KIND_ORDER else len(KIND_ORDER))
    filters = ['<button class="waste-filter active" type="button" data-filter="all" aria-pressed="true">Alle</button>']
    for kind in kinds_seen:
        label = formatiere_abfuhrarten(kind, mit_symbol=False)
        text = label[0] if label else kind
        filters.append(f'<button class="waste-filter" type="button" data-filter="{escape(_kind_token(kind), quote=True)}" aria-pressed="false">{escape(text)}</button>')

    upcoming = terms[1:7] if len(terms) > 1 else []
    upcoming_html = "".join(_term_card(item) for item in upcoming)
    if not upcoming_html:
        upcoming_html = '<div class="waste-mini-empty">Weitere Abholtermine werden ergänzt.</div>'

    all_cards = "".join(_term_card(item, compact=False) for item in terms)
    all_section = (
        f'<details class="waste-all"><summary><span>Alle Termine</span><small>{len(terms)} kommende Abholungen anzeigen</small><b>+</b></summary><div class="waste-all-grid">{all_cards}</div></details>'
        if terms else ""
    )

    push_panel = _push_panel(user, push_available, subscription_exists, reminder_time)

    styles = """
    <style>
    .waste-center{display:grid;gap:18px;min-width:0;max-width:100%}.waste-center *{min-width:0}.waste-center-head{padding:24px 0 4px}.waste-center-head h1{margin:6px 0 7px;font-size:clamp(34px,8vw,48px);letter-spacing:-.04em}.waste-center-head p{margin:0;color:var(--muted);line-height:1.55}.waste-next{position:relative;display:grid;grid-template-columns:58px 1fr;gap:14px;padding:22px;border:1px solid #cbdacb;border-radius:28px;background:linear-gradient(145deg,#f9fcf7,#edf5e9);box-shadow:var(--soft-shadow);overflow:hidden}.waste-next:after{content:"";position:absolute;right:-55px;top:-70px;width:170px;height:170px;border-radius:50%;background:rgba(111,157,112,.10)}.waste-next-icon{position:relative;z-index:1;width:58px;height:58px;display:grid;place-items:center;border-radius:19px;background:#fff;color:var(--forest);font-size:24px;box-shadow:0 7px 18px rgba(30,67,46,.08)}.waste-next-copy{position:relative;z-index:1}.waste-next-copy h2{margin:6px 0 4px;color:var(--forest);font-size:clamp(24px,6vw,34px);letter-spacing:-.035em}.waste-next-copy p{margin:0;color:#4f5d54;font-size:14px}.waste-kind-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.waste-kind-badges span{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.82);color:#355342;font-size:11px;font-weight:850}.waste-holiday-note{grid-column:1/-1;display:flex;gap:9px;align-items:center;padding:10px 12px;border-radius:14px;background:#fff2cf;color:#6d5215;font-size:12px}.waste-holiday-note strong{text-transform:uppercase;letter-spacing:.05em}.waste-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.waste-action-card{display:grid;grid-template-columns:42px 1fr 14px;gap:10px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;text-decoration:none;box-shadow:0 7px 20px rgba(28,63,45,.06)}.waste-action-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:var(--soft);color:var(--forest)}.waste-action-icon svg,.waste-push-icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.waste-action-card strong,.waste-action-card small{display:block}.waste-action-card strong{color:var(--forest);font-size:14px}.waste-action-card small{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.3}.waste-action-card b{color:var(--forest);font-size:20px}.waste-push-card{display:grid;grid-template-columns:54px 1fr;gap:13px 14px;padding:20px;border-radius:26px;color:#fff;background:linear-gradient(135deg,#174936,#0e3929);box-shadow:0 15px 34px rgba(23,73,54,.20)}.waste-push-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:18px;background:rgba(255,255,255,.13)}.waste-push-copy .eyebrow{color:#bcd8b8}.waste-push-copy h2{margin:5px 0 6px;font-size:22px}.waste-push-copy p{margin:0;color:rgba(255,255,255,.78);font-size:13px;line-height:1.5}.waste-push-controls{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}.waste-push-controls.single{grid-template-columns:1fr}.waste-reminder-select span{display:block;margin-bottom:6px;color:rgba(255,255,255,.78);font-size:11px;font-weight:800}.waste-reminder-select select{width:100%;min-height:48px;padding:0 12px;border:1px solid rgba(255,255,255,.22);border-radius:14px;color:#173b2b;background:#fff;font-size:13px;font-weight:750}.waste-push-button{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:11px 15px;border:1px solid rgba(255,255,255,.22);border-radius:14px;color:var(--forest);background:#fff;text-decoration:none;font-weight:900;cursor:pointer}.waste-push-button.active{color:#fff;background:rgba(255,255,255,.14)}.waste-push-button:disabled{opacity:.55;cursor:not-allowed}.waste-push-status{grid-column:1/-1;color:rgba(255,255,255,.72);font-size:11px;line-height:1.45}.waste-section-head{display:flex;justify-content:space-between;gap:12px;align-items:end}.waste-section-head h2{margin:4px 0 0;color:var(--forest);font-size:22px}.waste-section-head small{color:var(--muted);font-size:11px}.waste-filters{display:flex;gap:7px;overflow-x:auto;padding:1px 0 4px;scrollbar-width:none}.waste-filters::-webkit-scrollbar{display:none}.waste-filter{flex:0 0 auto;min-height:36px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:#57655c;background:#fff;font-size:11px;font-weight:850}.waste-filter.active{border-color:#aac6a3;color:var(--forest);background:var(--soft)}.waste-term-grid,.waste-all-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.waste-term-card{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:19px;background:#fff;box-shadow:0 6px 18px rgba(28,63,45,.05)}.waste-date-box{width:52px;height:58px;display:grid;place-items:center;align-content:center;border-radius:15px;background:#eef3eb;color:var(--forest)}.waste-date-box strong{font-size:21px;line-height:1}.waste-date-box small{margin-top:4px;font-size:9px;font-weight:900;letter-spacing:.08em}.tone-paper .waste-date-box{background:#edf3f8;color:#355d79}.tone-yellow .waste-date-box{background:#fff7d5;color:#7b6419}.tone-bio .waste-date-box{background:#f2ede5;color:#6e5339}.tone-rest .waste-date-box{background:#edf0ee;color:#3f4943}.waste-term-copy strong,.waste-term-copy span,.waste-term-copy small{display:block}.waste-term-copy strong{color:#294536;font-size:13px;line-height:1.25}.waste-term-copy span{margin-top:4px;color:#667269;font-size:10px;line-height:1.35}.waste-term-copy>small{margin-top:4px;color:var(--forest);font-size:10px;font-weight:850}.waste-shift-badge{display:inline-flex!important;width:max-content;margin-top:6px!important;padding:4px 6px;border-radius:999px;background:#fff1c7;color:#735717!important;font-size:8px!important;font-weight:850}.waste-mini-empty,.waste-empty{padding:24px;border:1px dashed #c5d2c5;border-radius:22px;background:rgba(255,255,255,.6);color:var(--muted);text-align:center}.waste-empty span{font-size:32px}.waste-empty h2{margin:8px 0 5px;color:var(--forest)}.waste-empty p{margin:0}.waste-all{border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.72);overflow:hidden}.waste-all summary{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;padding:16px 18px;cursor:pointer;list-style:none}.waste-all summary::-webkit-details-marker{display:none}.waste-all summary span{color:var(--forest);font-weight:900}.waste-all summary small{grid-column:1;color:var(--muted);font-size:10px}.waste-all summary b{grid-column:2;grid-row:1/3;font-size:22px;color:var(--forest);transition:.2s}.waste-all[open] summary b{transform:rotate(45deg)}.waste-all-grid{padding:0 12px 12px}.waste-term-card[hidden]{display:none!important}@media(max-width:560px){.waste-next{grid-template-columns:50px 1fr;padding:18px}.waste-next-icon{width:50px;height:50px;border-radius:16px}.waste-push-card{grid-template-columns:48px 1fr;padding:17px}.waste-push-icon{width:48px;height:48px;border-radius:16px}.waste-push-controls{grid-template-columns:1fr}.waste-actions{gap:8px}.waste-action-card{grid-template-columns:38px 1fr 10px;padding:12px 10px}.waste-action-icon{width:38px;height:38px}.waste-term-grid,.waste-all-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.waste-term-card{grid-template-columns:44px 1fr;padding:10px 9px;gap:8px}.waste-date-box{width:44px;height:52px}.waste-date-box strong{font-size:18px}.waste-term-copy strong{font-size:11px}.waste-term-copy span,.waste-term-copy>small{font-size:9px}}@media(max-width:350px){.waste-term-grid,.waste-all-grid,.waste-actions{grid-template-columns:1fr}}
    </style>"""

    script = """
    <script>
    (() => {
      const filterButtons = [...document.querySelectorAll('.waste-filter')];
      const termCards = [...document.querySelectorAll('[data-waste-term]')];
      filterButtons.forEach(button => button.addEventListener('click', () => {
        const filter = button.dataset.filter || 'all';
        filterButtons.forEach(item => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        termCards.forEach(card => {
          const kinds = String(card.dataset.kinds || '').split('|');
          card.hidden = filter !== 'all' && !kinds.includes(filter);
        });
      }));

      const panel = document.getElementById('muell-erinnern');
      const toggle = document.getElementById('waste-push-toggle');
      const select = document.getElementById('waste-reminder-time');
      const status = document.getElementById('waste-push-status');
      if (!panel || !toggle || !select || !status) return;

      let enabled = panel.dataset.enabled === 'true';
      let deviceReady = false;

      const keyToBytes = value => {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
      };

      const setBusy = busy => {
        toggle.disabled = busy;
        select.disabled = busy;
      };

      const refreshButton = () => {
        toggle.classList.toggle('active', enabled && deviceReady);
        if (enabled && deviceReady) toggle.textContent = '✓ Erinnerungen aktiv';
        else if (enabled) toggle.textContent = 'Push auf diesem Gerät aktivieren';
        else toggle.textContent = 'Erinnerungen aktivieren';
      };

      const currentDeviceSubscription = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
        try {
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
          ]);
          return await registration.pushManager.getSubscription();
        } catch (_error) {
          return null;
        }
      };

      const ensureDevicePush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
          throw new Error('Dieses Gerät unterstützt Browser-Push nicht. Auf iPhone/iPad muss Ahnsen hilft als App zum Home-Bildschirm hinzugefügt sein.');
        }
        if (Notification.permission === 'denied') {
          throw new Error('Benachrichtigungen sind blockiert. Bitte in den Website-/App-Berechtigungen Benachrichtigungen zulassen.');
        }
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht freigegeben.');
        }

        const keyResponse = await fetch('/api/push/public-key', { credentials: 'same-origin', cache: 'no-store' });
        if (!keyResponse.ok) throw new Error('Push ist auf dem Server gerade nicht verfügbar.');
        const keyData = await keyResponse.json();
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Der Push-Dienst konnte nicht gestartet werden.')), 12000))
        ]);
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyToBytes(keyData.publicKey)
          });
        }
        const save = await fetch('/api/push/subscribe', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });
        if (!save.ok) throw new Error('Die Push-Freigabe konnte nicht gespeichert werden.');
        deviceReady = true;
      };

      const saveSetting = async active => {
        const response = await fetch('/api/muell/push-einstellung', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: active, reminder_time: select.value })
        });
        if (response.status === 401) {
          location.href = '/anmelden?next=/muelltermine-info';
          return null;
        }
        if (!response.ok) {
          let message = 'Die Einstellung konnte nicht gespeichert werden.';
          try { message = (await response.json()).detail || message; } catch (_error) {}
          throw new Error(message);
        }
        return response.json();
      };

      toggle.addEventListener('click', async () => {
        setBusy(true);
        try {
          if (enabled && deviceReady) {
            await saveSetting(false);
            enabled = false;
            status.textContent = 'Müll-Erinnerungen sind deaktiviert. Andere Push-Kategorien bleiben unverändert.';
          } else {
            status.textContent = 'Push wird auf diesem Gerät eingerichtet …';
            await ensureDevicePush();
            const data = await saveSetting(true);
            if (!data) return;
            enabled = true;
            status.textContent = `Erinnerungen aktiv · ${data.label}.`;
          }
        } catch (error) {
          status.textContent = error.message || 'Push konnte nicht eingerichtet werden.';
        } finally {
          refreshButton();
          setBusy(false);
        }
      });

      select.addEventListener('change', async () => {
        if (!enabled) return;
        setBusy(true);
        try {
          const data = await saveSetting(true);
          if (data) status.textContent = `Erinnerungszeit gespeichert · ${data.label}.`;
        } catch (error) {
          status.textContent = error.message || 'Erinnerungszeit konnte nicht gespeichert werden.';
        } finally {
          setBusy(false);
        }
      });

      currentDeviceSubscription().then(subscription => {
        deviceReady = Boolean(subscription);
        refreshButton();
        if (enabled && !deviceReady) status.textContent = 'Erinnerungen sind im Konto aktiviert. Tippe auf den Button, um Push auf diesem Gerät freizugeben.';
      });
    })();
    </script>"""

    content = f"""
    {styles}
    <div class="waste-center">
      <section class="waste-center-head"><a class="back-link" href="/">← Start</a><span class="eyebrow">Abfall-Zentrale</span><h1>Müllabfuhr</h1><p>Die nächsten Abholungen für Ahnsen – kompakt, filterbar und auf Wunsch automatisch als Push-Erinnerung.</p></section>
      {hero}
      {actions}
      {push_panel}
      <section class="waste-section-head"><div><span class="eyebrow">Nächste Termine</span><h2>Was kommt danach?</h2></div><small>{len(terms)} Termine geladen</small></section>
      <div class="waste-filters" aria-label="Abfallarten filtern">{''.join(filters)}</div>
      <div class="waste-term-grid">{upcoming_html}</div>
      {all_section}
    </div>
    {script}
    """
    return page("Müllabfuhr", content, active="calendar", description="Abfuhrtermine, Kalender und Push-Erinnerungen für Ahnsen.")


@router.get("/muelltermine-info", name="waste_center_page")
async def waste_center_page(request: Request):
    user = _current_user(request)
    return render_waste_center(
        get_naechste_muelltermine(limit=24),
        user,
        subscription_exists=bool(user and has_push_subscription(user.id)),
        push_available=push_configured(),
    )


@router.post("/api/muell/push-einstellung", name="waste_push_setting")
async def waste_push_setting(request: Request):
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Bitte zuerst anmelden")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    enabled = bool(payload.get("enabled"))
    reminder_time = str(payload.get("reminder_time") or "")
    try:
        return set_waste_push_setting(user.id, enabled, reminder_time)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
