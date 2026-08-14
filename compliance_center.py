from __future__ import annotations

import os
from datetime import date
from html import escape

from fastapi.responses import HTMLResponse

from community_dashboard import _page as admin_page
from platform_runtime import get_platform_snapshot
from pwa_ui import page


REVIEW_DATE = date(2026, 8, 14)


DATA_FLOWS = (
    ("Webbetrieb", "IP-Adresse, Zeitpunkt, Browser-/Geräteangaben", "Auslieferung, Sicherheit und Fehleranalyse", "Render Web Service; Region Frankfurt"),
    ("Mängelmelder", "Beschreibung, Ort, optional Foto, Standort, Name und E-Mail", "Bearbeitung und Rückfragen zu einer Meldung", "Verwaltungsbereich, Datenbank und konfiguriertes Verwaltungspostfach"),
    ("Bürgerkonto", "Name, E-Mail, optional Telefon, Passwort-Hash und Einstellungen", "Konto, Statusinformationen und Benachrichtigungen", "Datenbank in Frankfurt"),
    ("DGH-Anfrage", "Termin, Anlass, Kontakt- und Nachrichtendaten", "Prüfung und Beantwortung der Anfrage", "Verwaltungsbereich und konfiguriertes Verwaltungspostfach"),
    ("Push-Nachrichten", "Push-Endpunkt, Geräteschlüssel und Auswahl der Themen", "Vom Nutzer bestellte Benachrichtigungen", "Browser-Push-Dienst des jeweiligen Geräteanbieters"),
    ("Karten und Mobilität", "Kartenausschnitt, Suchbegriff oder Haltestelle; GPS nur nach Freigabe", "Karte, Routen- und Fahrplanauskunft", "OpenStreetMap/OpenFreeMap, Nominatim und öffentliche Mobilitäts-APIs"),
    ("Wetter und Warnungen", "Ort Ahnsen; keine Formulareingaben", "Wetterlage und amtliche Warninformationen", "Open-Meteo, DWD und BBK"),
    ("Übersetzung", "Sichtbare Seitentexte nach aktiver Sprachauswahl", "Maschinelle Übersetzung", "Konfigurierter LibreTranslate-kompatibler Dienst; keine Formulareingaben"),
)


def _configured(value: str) -> bool:
    return bool(str(value or "").strip())


def _contact_block(cfg: dict) -> tuple[str, bool]:
    complete = all(_configured(cfg.get(key, "")) for key in ("contact_name", "contact_address", "contact_email", "contact_phone"))
    rows = [f"<strong>{escape(cfg.get('contact_name') or 'Künftiger offizieller Betreiber')}</strong>"]
    for value in (cfg.get("contact_address"), cfg.get("contact_email"), cfg.get("contact_phone")):
        if _configured(value):
            rows.append(escape(str(value)))
    if not complete:
        rows.append('<mark>Vor der offiziellen Freigabe durch die Gemeinde zu vervollständigen und zu bestätigen.</mark>')
    return "<br>".join(rows), complete


def _heading(title: str, eyebrow: str = "Recht & Transparenz") -> str:
    return f'<section class="page-heading compact"><a class="back-link" href="/mehr">← Mehr</a><span class="eyebrow">{escape(eyebrow)}</span><h1>{escape(title)}</h1></section>'


def legal_notice_page() -> HTMLResponse:
    cfg = get_platform_snapshot()
    contact, complete = _contact_block(cfg)
    status = "Pflichtangaben vollständig konfiguriert" if complete else "Noch nicht zur amtlichen Veröffentlichung freigegeben"
    content = _heading("Impressum") + f'''
    <article class="legal-card compliance-document">
      <div class="compliance-status {'ready' if complete else 'blocked'}"><strong>{escape(status)}</strong><p>Diese Seite befindet sich im Entwicklungs- und Pilotbetrieb. Eine Übernahme als offizielles Angebot muss durch den künftigen Betreiber ausdrücklich bestätigt werden.</p></div>
      <h2>Verantwortliche Stelle / Diensteanbieter</h2><p>{contact}</p>
      <h2>Redaktionell verantwortlich</h2><p><mark>Vor der offiziellen Freigabe durch die Gemeinde zu benennen.</mark></p>
      <h2>Technischer Betrieb</h2><p>Die Anwendung wird derzeit als Webdienst bei Render betrieben. Webdienst und Datenbank sind für die Region Frankfurt eingerichtet.</p>
      <h2>Hinweis zu Inhalten</h2><p>Amtliche Bekanntmachungen sind nur dann rechtsverbindlich, wenn dies beim jeweiligen Inhalt ausdrücklich angegeben und von der zuständigen Stelle bestätigt ist. Verlinkte Angebote liegen in der Verantwortung ihrer jeweiligen Betreiber.</p>
    </article>'''
    return page("Impressum", content, active="more", description="Anbieterkennzeichnung und Betriebsstatus")


def privacy_page() -> HTMLResponse:
    cfg = get_platform_snapshot()
    contact, complete = _contact_block(cfg)
    dsb_email = os.getenv("OFFICIAL_DSB_EMAIL", "").strip()
    dsb = escape(dsb_email) if dsb_email else '<mark>Der behördliche Datenschutzbeauftragte und sein Zuständigkeitsumfang müssen vor der offiziellen Freigabe bestätigt werden.</mark>'
    rows = "".join(f"<tr><th scope='row'>{escape(name)}</th><td>{escape(data)}</td><td>{escape(purpose)}</td><td>{escape(receiver)}</td></tr>" for name, data, purpose, receiver in DATA_FLOWS)
    content = _heading("Datenschutz") + f'''
    <article class="legal-card compliance-document">
      <div class="compliance-status {'ready' if complete and dsb_email else 'blocked'}"><strong>Transparente Vorabfassung</strong><p>Die tatsächlichen Datenflüsse der Anwendung sind dokumentiert. Verantwortliche Stelle, Rechtsgrundlagen, Auftragsverarbeitung und Datenschutzbeauftragter müssen vor dem amtlichen Betrieb abschließend bestätigt werden.</p></div>
      <h2>1. Verantwortliche Stelle</h2><p>{contact}</p>
      <h2>2. Datenschutzbeauftragter</h2><p>{dsb}</p>
      <h2>3. Verarbeitungsvorgänge</h2><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Bereich</th><th>Daten</th><th>Zweck</th><th>Empfänger / Dienst</th></tr></thead><tbody>{rows}</tbody></table></div>
      <h2>4. Rechtsgrundlagen</h2><p>Für einen amtlichen Betrieb sind die Rechtsgrundlagen vom Verantwortlichen je Vorgang festzulegen. In Betracht kommen insbesondere die Wahrnehmung einer Aufgabe im öffentlichen Interesse, die Erfüllung gesetzlicher Pflichten, vorvertragliche Maßnahmen bei Anfragen und eine freiwillige Einwilligung bei optionalen Funktionen.</p>
      <h2>5. Speicherdauer</h2><p>Daten werden nur so lange gespeichert, wie sie für Bearbeitung, Nachweis und gesetzliche Aufbewahrung erforderlich sind. Das technische Löschkonzept sieht getrennte Fristen für Konten, Meldungen, DGH-Anfragen, Push-Abonnements, Protokolle und Sicherungen vor. Die verbindlichen Fristen muss die verantwortliche Stelle vor der Freigabe beschließen.</p>
      <h2>6. Fotos und Standort</h2><p>Standortdaten werden nur nach einer ausdrücklichen Gerätefreigabe übernommen. Fotos sind freiwillig. Vor einer Veröffentlichung werden Meldungen moderiert; öffentliche Koordinaten werden gerundet. Bitte keine erkennbaren Personen, Kennzeichen oder privaten Dokumente hochladen.</p>
      <h2>7. Lokale Speicherung und Cookies</h2><p>Die PWA verwendet technisch notwendige Sitzungsinformationen sowie lokale Einstellungen für Sprache, Darstellung und Offline-Funktion. Es findet kein Werbe- oder Reichweitentracking statt. Ein Einwilligungsbanner ist nur erforderlich, wenn künftig nicht notwendige Dienste hinzukommen.</p>
      <h2>8. Externe Dienste</h2><p>Karten-, Mobilitäts-, Wetter-, Warn- und Übersetzungsfunktionen rufen die in der Tabelle genannten Dienste nur bei der jeweiligen Nutzung auf. Karten werden zusätzlich durch textliche Informationen ergänzt. Bei der Übersetzung werden sichtbare Seitentexte, aber keine Formulareingaben übertragen.</p>
      <h2>9. Hosting und Drittlandbezug</h2><p>Webdienst und Datenbank sind in Frankfurt eingerichtet. Render und einzelne Unterauftragnehmer können dennoch einen Drittlandbezug haben. Auftragsverarbeitungsvertrag, Unterauftragnehmer, technische Maßnahmen und geeignete Garantien sind vor einem amtlichen Betrieb durch den Verantwortlichen zu dokumentieren.</p>
      <h2>10. Betroffenenrechte</h2><p>Betroffene können Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und – soweit einschlägig – Widerspruch oder Widerruf verlangen. Außerdem besteht ein Beschwerderecht bei der zuständigen Datenschutzaufsicht.</p>
      <h2>11. Sicherheit</h2><p>Die Plattform nutzt verschlüsselte Übertragung, rollenbasierten Verwaltungszugang, Zwei-Faktor-Authentisierung, widerrufbare Sitzungen, Rate-Limits, Protokollierung, Sicherungen und Diagnoseprüfungen. Sicherheitsvorfälle werden nach dem internen Vorfallplan bewertet und dokumentiert.</p>
      <p class="legal-updated">Stand der technischen Vorabfassung: {REVIEW_DATE.strftime('%d.%m.%Y')}</p>
    </article>'''
    return page("Datenschutz", content, active="more", description="Datenschutzhinweise und Datenflüsse")


def accessibility_page(message: str = "", error: str = "") -> HTMLResponse:
    cfg = get_platform_snapshot()
    alert = f'<div class="form-alert" role="status">{escape(message)}</div>' if message else ""
    if error:
        alert = f'<div class="form-alert error" role="alert">{escape(error)}</div>'
    content = _heading("Erklärung zur Barrierefreiheit", "Barrierefreiheit") + f'''
    <article class="legal-card compliance-document">
      <div class="compliance-status pending"><strong>Vorläufige technische Selbstbewertung</strong><p>Die Anwendung ist nach dem derzeitigen Entwicklungsstand teilweise mit den Anforderungen an barrierefreie öffentliche Websites vereinbar. Die formale Erklärung muss vor dem amtlichen Betrieb von der verantwortlichen Stelle bestätigt und der niedersächsischen Überwachungsstelle mitgeteilt werden.</p></div>
      <h2>Geltungsbereich</h2><p>Diese Erklärung gilt für {escape(cfg['platform_name'])} einschließlich der öffentlich erreichbaren PWA-Seiten.</p>
      <h2>Stand der Vereinbarkeit</h2><p>Die Bedienoberfläche bietet Tastaturfokus, Sprunglink, semantische Formulare, vergrößerbare Schrift, hohen Kontrast, reduzierte Bewegung und eine vereinfachte Ansicht. Eine repräsentative manuelle Prüfung nach EN 301 549 / WCAG 2.1 AA ist vorbereitet, aber noch nicht durch die künftige öffentliche Stelle abgeschlossen.</p>
      <h2>Noch bekannte Einschränkungen</h2><ul><li>Einzelne historische PDF-Dokumente können noch nicht vollständig barrierefrei sein.</li><li>Interaktive Karten sind visuell; textliche Alternativen und externe Kartendaten können abweichend zugänglich sein.</li><li>Maschinelle Übersetzungen können Fehler enthalten; die deutsche Originalfassung ist maßgeblich.</li><li>Inhalte externer Anbieter liegen nicht vollständig im Einflussbereich der Plattform.</li></ul>
      <h2>Erstellung und Aktualisierung</h2><p>Erstellt am {REVIEW_DATE.strftime('%d.%m.%Y')} auf Grundlage einer technischen Selbstbewertung. Die Erklärung ist mindestens jährlich und nach wesentlichen Änderungen zu überprüfen.</p>
      <h2>Barriere melden</h2><p>Beschreibe möglichst genau, auf welcher Seite und mit welchem Gerät oder Hilfsmittel das Problem auftritt. Name und E-Mail sind freiwillig.</p>{alert}
      <form class="report-form compact-compliance-form" method="post" action="/barrierefreiheit-feedback">
        <label class="field"><span>Name (freiwillig)</span><input name="name" maxlength="120" autocomplete="name"></label>
        <label class="field"><span>E-Mail für Rückfragen (freiwillig)</span><input name="email" type="email" maxlength="180" autocomplete="email"></label>
        <label class="field full"><span>Betroffene Seite oder Adresse</span><input name="url" maxlength="500" placeholder="z. B. /mangel-melden"></label>
        <label class="field full"><span>Beschreibung der Barriere *</span><textarea name="message" minlength="10" maxlength="3000" required></textarea><small>Mindestens 10 Zeichen.</small></label>
        <label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="consent full"><input name="privacy" type="checkbox" value="ja" required><span>Ich habe die <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzhinweise</a> gelesen. *</span></label>
        <button class="primary-button" type="submit">Barriere melden</button>
      </form>
      <h2>Durchsetzungsverfahren</h2><p>Wenn eine Rückmeldung nicht zufriedenstellend beantwortet wird, kann die Schlichtungsstelle nach dem Niedersächsischen Behindertengleichstellungsgesetz angerufen werden. Die zuständige Stelle und der verbindliche Kontakt sind vor der amtlichen Freigabe durch die Gemeinde zu bestätigen. Weitere Informationen bietet der <a href="https://www.behindertenbeauftragter-niedersachsen.de/" rel="noopener">Landesbeauftragte für Menschen mit Behinderungen Niedersachsen</a>.</p>
    </article>'''
    return page("Erklärung zur Barrierefreiheit", content, active="more")


def easy_language_page() -> HTMLResponse:
    cfg = get_platform_snapshot()
    content = _heading("Leichte Sprache", "Einfach erklärt") + f'''
    <article class="legal-card compliance-document easy-language">
      <div class="compliance-status pending"><strong>Entwurf in einfacher Sprache</strong><p>Eine fachlich geprüfte Übersetzung in Leichte Sprache kann später ergänzt werden. Diese Seite erklärt die wichtigsten Funktionen bereits in kurzen Sätzen.</p></div>
      <h2>Was ist {escape(cfg['platform_name'])}?</h2><p>Das ist eine Internet-Seite für Menschen in {escape(cfg['municipality_name'])}.</p><p>Die Seite zeigt Termine, Nachrichten, Müll-Abfuhr, Bus und Warnungen.</p>
      <h2>Ein Problem melden</h2><p>Ist etwas kaputt oder gefährlich?</p><p>Dann wähle unten <strong>Melden</strong>.</p><p>Beschreibe den Ort und das Problem. Ein Foto ist freiwillig.</p>
      <h2>Hilfe bei der Bedienung</h2><p>Der Knopf <strong>Aa</strong> macht Schrift größer und erhöht den Kontrast.</p><p>Du kannst die Seite auch mit der Tastatur bedienen.</p>
      <h2>Wichtige Hinweise</h2><p>Bei einem Notfall rufe 112. Diese Internet-Seite ersetzt keinen Notruf.</p><p>Maschinelle Übersetzungen können Fehler enthalten. Die deutsche Fassung ist maßgeblich.</p>
      <h2>Kontakt</h2><p>Die offiziellen Kontaktdaten müssen vor der Freigabe durch die Gemeinde bestätigt werden.</p>
    </article>'''
    return page("Leichte Sprache", content, active="more")


def readiness_snapshot() -> dict:
    cfg = get_platform_snapshot()
    checks = (
        ("Verantwortliche Stelle", all(_configured(cfg.get(k, "")) for k in ("contact_name", "contact_address", "contact_email", "contact_phone")), "Name, Anschrift, E-Mail und Telefon vollständig"),
        ("Offizielle Basis-URL", _configured(cfg.get("public_base_url", "")), "Eigene Domain und kanonische URL hinterlegt"),
        ("Datenschutzbeauftragter", _configured(os.getenv("OFFICIAL_DSB_EMAIL", "")), "Zuständigkeit und Funktionspostfach bestätigt"),
        ("AVV / DPA", os.getenv("OFFICIAL_DPA_CONFIRMED", "").casefold() == "true", "Render-DPA, Unterauftragnehmer und Garantien geprüft"),
        ("Impressum freigegeben", os.getenv("OFFICIAL_IMPRINT_APPROVED", "").casefold() == "true", "Pflichtangaben durch Betreiber bestätigt"),
        ("Datenschutz freigegeben", os.getenv("OFFICIAL_PRIVACY_APPROVED", "").casefold() == "true", "Rechtsgrundlagen und Fristen durch Verantwortlichen bestätigt"),
        ("Barrierefreiheit freigegeben", os.getenv("OFFICIAL_ACCESSIBILITY_APPROVED", "").casefold() == "true", "Selbstbewertung abgeschlossen und Erklärung gemeldet"),
        ("Löschfristen beschlossen", os.getenv("OFFICIAL_RETENTION_APPROVED", "").casefold() == "true", "Löschkonzept organisatorisch freigegeben"),
        ("Amtliches Postfach", not str(os.getenv("EMAIL_USER", "")).casefold().endswith("@gmail.com"), "Funktionspostfach statt Privat-/Testkonto"),
        ("Produktionsregion", os.getenv("RENDER_REGION", "frankfurt").casefold() == "frankfurt", "Webdienst und Datenbank Frankfurt"),
    )
    ready = sum(1 for _, state, _ in checks if state)
    return {"checks": checks, "ready": ready, "total": len(checks), "blocked": len(checks) - ready}


def admin_readiness_page() -> HTMLResponse:
    status = readiness_snapshot()
    rows = "".join(f'<div class="admin-row"><strong>{"✓" if state else "!"} {escape(label)}</strong><br><small>{escape(detail)}</small><span class="status-chip" style="margin-left:8px">{"erledigt" if state else "offen"}</span></div>' for label, state, detail in status["checks"])
    flows = "".join(f"<tr><th scope='row'>{escape(name)}</th><td>{escape(data)}</td><td>{escape(purpose)}</td><td>{escape(receiver)}</td></tr>" for name, data, purpose, receiver in DATA_FLOWS)
    body = f'''
    <section><span class="eyebrow">Offizielle Betriebsreife</span><h1>Freigabecenter</h1><p>Technische und organisatorische Restpunkte für die Übernahme als offizielles Gemeindeangebot. Offene Punkte werden bewusst nicht als erledigt dargestellt.</p></section>
    <section class="admin-grid"><article class="admin-card metric"><strong>{status['ready']}/{status['total']}</strong><span>Freigabepunkte erfüllt</span></article><article class="admin-card metric"><strong>{status['blocked']}</strong><span>Bestätigungen noch offen</span></article><article class="admin-card"><h2>Technik</h2><p>Frankfurt-Betrieb, Sicherheitsfunktionen, Backups, Audit und Pflichtseiten sind vorbereitet.</p></article><article class="admin-card"><h2>Entscheidung</h2><p>Gemeinde, Datenschutzbeauftragter und zuständige Redaktion müssen die markierten Angaben bestätigen.</p></article></section>
    <section class="admin-section"><h2>Freigabe-Checkliste</h2><div class="admin-list">{rows}</div></section>
    <section class="admin-section"><h2>Datenfluss-Inventar</h2><div style="overflow:auto"><table class="admin-table"><thead><tr><th>Bereich</th><th>Daten</th><th>Zweck</th><th>Empfänger / Dienst</th></tr></thead><tbody>{flows}</tbody></table></div></section>
    <section class="admin-section"><h2>Vorbereitete Unterlagen</h2><p>Im Repository liegen Selbstbewertung, TOM, Löschkonzept, Backup-/Wiederherstellungsplan, Vorfallplan, AVV-Checkliste, DSFA-Vorprüfung und Redaktionsleitfaden. Sie sind Arbeitsunterlagen und ersetzen keine formale Freigabe durch die zuständigen Stellen.</p><p><a class="admin-button secondary" href="/barrierefreiheit" target="_blank" rel="noopener">Barrierefreiheit ansehen</a> <a class="admin-button secondary" href="/datenschutz" target="_blank" rel="noopener">Datenschutz ansehen</a> <a class="admin-button secondary" href="/impressum" target="_blank" rel="noopener">Impressum ansehen</a></p></section>
    '''
    return admin_page("Freigabecenter", "compliance", body)
