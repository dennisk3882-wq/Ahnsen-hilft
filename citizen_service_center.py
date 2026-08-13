from __future__ import annotations

from html import escape

from fastapi import APIRouter

from pwa_ui import page


router = APIRouter()

SG = "https://www.samtgemeinde-eilsen.de"
A_Z = f"{SG}/content/buergerservice/leistungen-von-a---z.html"
FORMS = f"{SG}/content/buergerservice/formulare-und-antraege.html"
STANDESAMT = f"{SG}/content/buergerservice/standesamt.html"
OPENING = f"{SG}/content/buergerservice/oeffnungszeiten.html"
CONTACT = f"{SG}/common/info/"
EMAILS = f"{SG}/common/info/e-mail.html"


def _external(url: str, label: str, *, primary: bool = False) -> str:
    cls = "service-action primary" if primary else "service-action"
    return (
        f'<a class="{cls}" href="{escape(url, quote=True)}" target="_blank" '
        f'rel="noopener noreferrer">{escape(label)} <span aria-hidden="true">↗</span></a>'
    )


def _service_row(title: str, text: str, url: str, action: str, kind: str = "Info", *, primary: bool = False) -> str:
    search = f"{title} {text} {kind}".casefold()
    return f'''
    <article class="service-row" data-service-search="{escape(search, quote=True)}">
      <div class="service-row-copy">
        <span class="service-type">{escape(kind)}</span>
        <h3>{escape(title)}</h3>
        <p>{escape(text)}</p>
      </div>
      {_external(url, action, primary=primary)}
    </article>
    '''


OFFICIAL_PDFS = [
    ("SEPA-Lastschriftmandat", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/sepa-lastschriftmandat1.pdf"),
    ("Gaststättengewerbe – Anzeige", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/anzeige-ngastg1.pdf"),
    ("Gaststättengewerbe – Anlage zur Anzeige", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/anzeige-ngastg_anlage1.pdf"),
    ("Gewerbebetrieb – Anmeldung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Gewerbe_Anmeldung.pdf"),
    ("Gewerbebetrieb – Ummeldung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Gewerbe_Ummeldung.pdf"),
    ("Gewerbebetrieb – Abmeldung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Gewerbe_Abmeldung.pdf"),
    ("Grundstücksentwässerung – Antrag", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Entw%C3%A4sserungsantrag.pdf"),
    ("Hundehaltung – Informationen", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/031---informationen-zur-hundehaltung-stand-09-2025-1.pdf"),
    ("Hundehaltung – Anmeldung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/020---anmeldung-eines-hundes1.pdf"),
    ("Hundehaltung – Abmeldung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Hund_Abmeldung.pdf"),
    ("Wohnungsgeberbestätigung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7df20d09390b00297161fcf396328ce/Wohnungsgeberbestaetigung.pdf"),
    ("Eheschließung – Informationsblatt", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7e881d0b2c0d0013c436221182b27c3/information-eheschliessung-09.2025-1.pdf"),
    ("Eheschließung im Rathaus", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7e881d0b2c0d0013c436221182b27c3/2-eheschleissung-im-rathaus1.pdf"),
    ("Vollmacht zur Anmeldung der Eheschließung", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7e881d0b2c0d0013c436221182b27c3/3-vollmacht-zur-anmeldung-eheschliessung1.pdf"),
    ("Checkliste nach der Hochzeit", "https://www.samtgemeinde-eilsen.de/assets/downloads/w7e881d0b2c0d0013c436221182b27c3/4-checkliste1.pdf"),
]

ALL_SERVICES = [
    "Abmeldung Gewerbe", "Abmeldung Hund", "Abmeldung Wohnsitz", "Anmeldung Gewerbe", "Anmeldung Hund", "Anmeldung Wohnsitz",
    "Aufenthaltsbescheinigung", "Auskunft Gewerberegister", "Auskunft Melderegister", "Ausweise", "Bauamt", "Bauantrag",
    "Baubetriebshof", "Baugenehmigung", "Bebauungsplan", "Beglaubigung", "Biomüll", "Bürgerbüro", "Eheschließung",
    "Einwohnermeldeamt", "Erschließungsbeitrag", "Ferienspaß", "Feuer und Brauchtumsfeuer", "Feuerwehrangelegenheiten",
    "Fischereischein", "Friedhof", "Führungszeugnis", "Fundsachen", "Gartenwasserzähler", "Geburt", "Gewerbesteuer",
    "Gewerbezentralregister", "Grünabfall", "Grünflächen", "Grundschule", "Grundsteuer", "Grundstücksentwässerung",
    "Hausanschlussbeitrag", "Hausmüll", "Hunderegister", "Hundesteuer", "Kämmerei", "Kanalgebühren", "Kasse", "Kindergarten",
    "Kindergarten Gebührenbefreiung", "Kompostanlage", "Lebensbescheinigung", "Liegenschaften", "Melderegisterauskunft",
    "Mietpreisspiegel", "Müllentsorgung", "Illegale Müllentsorgung", "Obdachlosigkeit", "Ordnungsamt", "Osterfeuer", "Papiermüll",
    "Pass", "Personalausweis", "Ratten und Ungeziefer", "Reisepass", "Rentenangelegenheiten", "Restmüll", "Schule", "Sperrmüll",
    "Sportanlagen und Turnhallen", "Standesamt", "Sterbefall", "Straßenreinigung", "Ummeldung Gewerbe", "Ummeldung Wohnsitz",
    "Untersuchungsberechtigungsschein", "Verwarnungsgeld", "Vollstreckung", "Wahlen", "Wasserhärtegrad", "Winterdienst",
]


def _pdf_list() -> str:
    return "".join(
        f'<a class="document-row" href="{escape(url, quote=True)}" target="_blank" rel="noopener noreferrer" '
        f'data-service-search="{escape(title.casefold(), quote=True)}"><span class="document-icon">PDF</span><span>{escape(title)}</span><b>↗</b></a>'
        for title, url in OFFICIAL_PDFS
    )


def _az_chips() -> str:
    return "".join(
        f'<a class="az-chip" href="{escape(A_Z, quote=True)}" target="_blank" rel="noopener noreferrer" '
        f'data-service-search="{escape(name.casefold(), quote=True)}">{escape(name)}</a>'
        for name in ALL_SERVICES
    )


def citizen_service_page():
    sections = []

    sections.append(f'''
    <section class="service-section" id="ausweise">
      <div class="service-section-head"><span class="service-section-icon">🪪</span><div><span class="eyebrow">Ausweise & Meldewesen</span><h2>Alles rund um Wohnsitz und Dokumente</h2></div></div>
      <div class="service-list">
        {_service_row("Personalausweis", "Beantragung und Informationen über das Meldeamt der Samtgemeinde Eilsen.", A_Z, "Informationen", "Vor Ort")}
        {_service_row("Reisepass", "Beantragung und Informationen über das Meldeamt der Samtgemeinde Eilsen.", A_Z, "Informationen", "Vor Ort")}
        {_service_row("Wohnsitz an-, um- oder abmelden", "Zuständigkeit, benötigte Unterlagen und Kontakt zum Einwohnermeldeamt.", A_Z, "Meldeamt öffnen", "Vor Ort")}
        {_service_row("Wohnungsgeberbestätigung", "Offizielles Formular der Samtgemeinde zum Ein- oder Auszug.", OFFICIAL_PDFS[10][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Führungszeugnis", "Online-Antrag über das offizielle Portal des Bundesamts für Justiz.", "https://www.fuehrungszeugnis.bund.de/", "Online beantragen", "Online", primary=True)}
        {_service_row("Meldebescheinigung & Melderegister", "Informationen zu Aufenthaltsbescheinigung, Beglaubigung und Melderegisterauskunft.", A_Z, "Leistung ansehen", "Info")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="standesamt">
      <div class="service-section-head"><span class="service-section-icon">💍</span><div><span class="eyebrow">Standesamt</span><h2>Urkunden & Eheschließung</h2></div></div>
      <div class="service-list">
        {_service_row("Geburtsurkunde", "Direkte Onlinebestellung beim offiziellen Dienst des Standesamts.", "https://govforms.govconnect.de/forms/geburtsurkunde.html?pmo-customer-id=7de9919b-a893-4770-9f0d-8b5c2a142070", "Online beantragen", "Online", primary=True)}
        {_service_row("Sterbeurkunde", "Direkte Onlinebestellung beim offiziellen Dienst des Standesamts.", "https://govforms.govconnect.de/forms/sterbeurkunde.html?pmo-customer-id=7de9919b-a893-4770-9f0d-8b5c2a142070", "Online beantragen", "Online", primary=True)}
        {_service_row("Eheurkunde", "Direkte Onlinebestellung beim offiziellen Dienst des Standesamts.", "https://govforms.govconnect.de/forms/eheurkunde.html?pmo-customer-id=7de9919b-a893-4770-9f0d-8b5c2a142070", "Online beantragen", "Online", primary=True)}
        {_service_row("Lebenspartnerschaftsurkunde", "Direkte Onlinebestellung beim offiziellen Dienst des Standesamts.", "https://govforms.govconnect.de/forms/lebenspartnerschaftsurkunde.html?pmo-customer-id=7de9919b-a893-4770-9f0d-8b5c2a142070", "Online beantragen", "Online", primary=True)}
        {_service_row("Eheschließung voranmelden", "Online-Voranmeldung für eine Eheschließung beim Standesamt Bad Eilsen.", "https://govforms.govconnect.de/forms/voranmeldung-eheschliessung.html?pmo-customer-id=7de9919b-a893-4770-9f0d-8b5c2a142070", "Online starten", "Online", primary=True)}
        {_service_row("Eheschließung – Unterlagen", "Informationsblatt, Vollmacht, Rathaus-Informationen und Checkliste stehen als offizielle PDFs bereit.", STANDESAMT, "Standesamt öffnen", "Info")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="gewerbe">
      <div class="service-section-head"><span class="service-section-icon">🏢</span><div><span class="eyebrow">Gewerbe</span><h2>An-, um- und abmelden</h2></div></div>
      <div class="service-list">
        {_service_row("Gewerbe anmelden", "Offizielles PDF-Formular der Samtgemeinde Eilsen.", OFFICIAL_PDFS[3][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Gewerbe ummelden", "Offizielles PDF-Formular der Samtgemeinde Eilsen.", OFFICIAL_PDFS[4][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Gewerbe abmelden", "Offizielles PDF-Formular der Samtgemeinde Eilsen.", OFFICIAL_PDFS[5][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Gaststättengewerbe", "Anzeige und Anlage zur Anzeige direkt aus dem offiziellen Formularbereich.", FORMS, "Formulare öffnen", "PDF")}
        {_service_row("Gewerbezentralregister", "Online-Antrag über das vom Rathaus verlinkte Bundesportal.", "https://www.fuehrungszeugnis.bund.de/", "Online öffnen", "Online")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="hund-ordnung">
      <div class="service-section-head"><span class="service-section-icon">🐕</span><div><span class="eyebrow">Hund & Ordnung</span><h2>Hundehaltung und Ordnungsangelegenheiten</h2></div></div>
      <div class="service-list">
        {_service_row("Hund anmelden", "Offizielles Formular für Hundesteuer und Ordnungsamt.", OFFICIAL_PDFS[8][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Hund abmelden", "Offizielles Abmeldeformular der Samtgemeinde Eilsen.", OFFICIAL_PDFS[9][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Informationen zur Hundehaltung", "Hinweise der Samtgemeinde zur Hundehaltung.", OFFICIAL_PDFS[7][1], "PDF öffnen", "PDF")}
        {_service_row("Niedersächsisches Hunderegister", "Registrierung im zentralen Hunderegister Niedersachsen.", "https://www.hunderegister-nds.de/", "Register öffnen", "Online", primary=True)}
        {_service_row("Ordnungsamt, Fundsachen & Osterfeuer", "Zuständigkeiten und Ansprechpartner sind im offiziellen A–Z-Verzeichnis gebündelt.", A_Z, "Leistungen öffnen", "Info")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="wohnen">
      <div class="service-section-head"><span class="service-section-icon">🏠</span><div><span class="eyebrow">Wohnen & Grundstück</span><h2>Grundstück, Wasser und Abgaben</h2></div></div>
      <div class="service-list">
        {_service_row("Grundstücksentwässerung", "Offizieller Antrag der Samtgemeinde Eilsen als PDF.", OFFICIAL_PDFS[6][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Grundsteuer", "Zuständigkeit und Ansprechpartner im offiziellen Leistungsverzeichnis.", A_Z, "Informationen", "Info")}
        {_service_row("Gartenwasserzähler", "Informationen und zuständige Stelle über die Samtgemeinde.", A_Z, "Informationen", "Info")}
        {_service_row("Kanalgebühren & Hausanschlussbeitrag", "Gebühren und Ansprechpartner im offiziellen Leistungsverzeichnis.", A_Z, "Informationen", "Info")}
        {_service_row("Mietpreisspiegel", "Die Samtgemeinde verweist hierfür auf den Immobilienmarkt Niedersachsen.", "https://immobilienmarkt.niedersachsen.de/", "Portal öffnen", "Online")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="finanzen">
      <div class="service-section-head"><span class="service-section-icon">💶</span><div><span class="eyebrow">Finanzen</span><h2>Steuern, Gebühren & Zahlungen</h2></div></div>
      <div class="service-list">
        {_service_row("SEPA-Lastschriftmandat", "Lastschrift für Steuern, Gebühren, Beiträge und weitere Zahlungen.", OFFICIAL_PDFS[0][1], "PDF öffnen", "PDF", primary=True)}
        {_service_row("Hundesteuer", "Informationen zur Hundesteuer und zuständigen Stelle.", A_Z, "Informationen", "Info")}
        {_service_row("Gewerbesteuer", "Informationen und Ansprechpartner des Finanzwesens.", A_Z, "Informationen", "Info")}
        {_service_row("Kasse & Vollstreckung", "Zuständigkeiten und Kontakt im Leistungsverzeichnis der Samtgemeinde.", A_Z, "Informationen", "Info")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="familie">
      <div class="service-section-head"><span class="service-section-icon">👨‍👩‍👧</span><div><span class="eyebrow">Familie & Soziales</span><h2>Kita, Schule und soziale Anliegen</h2></div></div>
      <div class="service-list">
        {_service_row("Kindergarten & Gebührenbefreiung", "Informationen, Zuständigkeiten und weiterführende Angebote.", A_Z, "Leistung ansehen", "Info")}
        {_service_row("Grundschule & Schule", "Weiterführende Informationen über das offizielle Leistungsverzeichnis.", A_Z, "Leistung ansehen", "Info")}
        {_service_row("Rentenangelegenheiten", "Informationsangebot und zuständige Stelle der Samtgemeinde.", A_Z, "Informationen", "Info")}
        {_service_row("Obdachlosigkeit", "Kontakt und Zuständigkeit über das Ordnungsamt.", A_Z, "Informationen", "Info")}
      </div>
    </section>
    ''')

    sections.append(f'''
    <section class="service-section" id="bauen-umwelt">
      <div class="service-section-head"><span class="service-section-icon">🏗️</span><div><span class="eyebrow">Bauen & Umwelt</span><h2>Bauamt, Entsorgung und Infrastruktur</h2></div></div>
      <div class="service-list">
        {_service_row("Bauantrag & Baugenehmigung", "Zuständigkeiten des Bauamts und weiterführende Informationen.", A_Z, "Bauamt öffnen", "Info")}
        {_service_row("Bebauungspläne", "Informationen zu Bauleitplanung und zuständiger Stelle.", A_Z, "Informationen", "Info")}
        {_service_row("Abfallwirtschaft", "Biomüll, Hausmüll, Papier, Restmüll und Sperrmüll werden über die Abfallwirtschaft Schaumburg abgewickelt.", "https://aws-shg.de/", "Abfallwirtschaft öffnen", "Online")}
        {_service_row("Kompostanlage Heeßen", "Öffnungszeiten und Informationen der Samtgemeinde.", OPENING, "Öffnungszeiten", "Info")}
        {_service_row("Straßenreinigung & Winterdienst", "Zuständigkeiten und Informationen im offiziellen A–Z-Verzeichnis.", A_Z, "Informationen", "Info")}
      </div>
    </section>
    ''')

    styles = r'''
    <style id="citizen-service-center-style">
    .citizen-service-view .app-main{padding-bottom:190px}
    .service-lead{margin-bottom:16px;padding:18px;border:1px solid #dce6dc;border-radius:24px;background:linear-gradient(145deg,#f9fcf7,#eef6eb);box-shadow:0 10px 28px rgba(28,63,45,.08)}
    .service-lead-top{display:flex;align-items:flex-start;gap:12px}.service-lead-icon{width:50px;height:50px;display:grid;place-items:center;flex:0 0 auto;border-radius:17px;background:#dfeedd;font-size:24px}.service-lead h2{margin:0;color:var(--forest);font-size:20px}.service-lead p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.55}.official-badge{display:inline-flex;margin-top:12px;padding:6px 9px;border-radius:999px;background:#fff;color:var(--forest);font-size:11px;font-weight:850;border:1px solid #d7e3d7}.service-lead-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
    .service-search{position:sticky;top:84px;z-index:12;display:flex;align-items:center;gap:10px;margin:16px 0;padding:10px 12px;border:1px solid #dce5dc;border-radius:18px;background:rgba(255,253,248,.96);box-shadow:0 8px 22px rgba(28,63,45,.08);backdrop-filter:blur(12px)}.service-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:16px}.service-search span{color:var(--forest);font-size:21px}.service-search-clear{border:0;background:#edf4eb;color:var(--forest);border-radius:999px;padding:7px 10px;font-weight:850;cursor:pointer}
    .service-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:22px}.service-category{display:flex;align-items:center;gap:9px;min-height:64px;padding:12px;border:1px solid #dfe7df;border-radius:20px;background:#fff;text-decoration:none;box-shadow:0 7px 20px rgba(28,63,45,.06);font-weight:800;font-size:13px}.service-category span{font-size:21px}.service-category small{display:block;margin-top:3px;color:var(--muted);font-size:10px;font-weight:650}
    .service-section{margin:20px 0;padding:18px;border:1px solid #dde6dd;border-radius:26px;background:#fff;box-shadow:0 10px 28px rgba(28,63,45,.07);scroll-margin-top:155px}.service-section-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}.service-section-icon{width:48px;height:48px;display:grid;place-items:center;flex:0 0 auto;border-radius:16px;background:#eaf2e8;font-size:22px}.service-section-head h2{margin:3px 0 0;color:var(--forest);font-size:19px;line-height:1.15}.service-list{display:grid;gap:9px}.service-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px;border-radius:18px;background:#f7faf6;border:1px solid #e6ece4}.service-row-copy{min-width:0}.service-row h3{margin:4px 0 4px;font-size:14px;line-height:1.2}.service-row p{margin:0;color:var(--muted);font-size:11px;line-height:1.4}.service-type{display:inline-flex;padding:3px 6px;border-radius:999px;background:#e4eee1;color:#356247;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.service-action{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:38px;max-width:118px;padding:8px 10px;border:1px solid #cbdacb;border-radius:13px;background:#fff;color:var(--forest);font-size:10px;font-weight:900;text-decoration:none;text-align:center;line-height:1.15}.service-action.primary{color:#fff;border-color:var(--forest);background:var(--forest)}
    .resource-panel{margin:22px 0;border:1px solid #dce5dc;border-radius:24px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(28,63,45,.06)}.resource-panel summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 18px;cursor:pointer;font-weight:900;color:var(--forest);list-style:none}.resource-panel summary::-webkit-details-marker{display:none}.resource-panel summary::after{content:'+';font-size:24px}.resource-panel[open] summary::after{content:'−'}.resource-panel-body{padding:0 12px 14px}.document-row{display:grid;grid-template-columns:36px 1fr 18px;gap:10px;align-items:center;padding:11px 8px;border-top:1px solid #e6ece4;color:inherit;text-decoration:none;font-size:12px;font-weight:750}.document-icon{display:grid;place-items:center;width:36px;height:30px;border-radius:9px;background:#f1e8e5;color:#8c4438;font-size:9px;font-weight:900}.az-grid{display:flex;flex-wrap:wrap;gap:7px;padding-top:7px}.az-chip{padding:7px 9px;border:1px solid #dbe5da;border-radius:999px;background:#f8faf7;color:#445249;text-decoration:none;font-size:10px;font-weight:750}
    .rathaus-card{margin-top:22px;padding:18px;border-radius:26px;color:#fff;background:linear-gradient(135deg,#174936,#285f47);box-shadow:0 14px 34px rgba(23,73,54,.22)}.rathaus-card h2{margin:0 0 5px;font-size:20px}.rathaus-card p{margin:0;color:rgba(255,255,255,.82);font-size:12px;line-height:1.55}.rathaus-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.rathaus-meta div{padding:11px;border-radius:15px;background:rgba(255,255,255,.1)}.rathaus-meta small,.rathaus-meta strong{display:block}.rathaus-meta small{color:rgba(255,255,255,.7);font-size:9px}.rathaus-meta strong{margin-top:3px;font-size:11px;line-height:1.35}.rathaus-links{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.rathaus-links a{display:flex;align-items:center;justify-content:center;min-height:40px;padding:8px;border-radius:13px;background:#fff;color:var(--forest);font-size:11px;font-weight:900;text-decoration:none;text-align:center}
    .service-legal-note{margin:18px 0;padding:14px 15px;border-radius:18px;background:#f1f4ef;color:#5d6961;font-size:11px;line-height:1.55}.service-empty{display:none;margin:15px 0;padding:20px;border:1px dashed #bcccbc;border-radius:18px;text-align:center;color:var(--muted)}
    @media(max-width:560px){.citizen-service-view .page-heading{padding-bottom:13px}.citizen-service-view .page-heading h1{font-size:34px}.service-lead-actions,.rathaus-links{grid-template-columns:1fr}.service-search{top:78px}.service-row{grid-template-columns:1fr}.service-action{max-width:none;width:100%}.rathaus-meta{grid-template-columns:1fr 1fr}}
    </style>
    '''

    script = r'''
    <script>
    (() => {
      const input = document.getElementById('citizen-service-search');
      const clear = document.getElementById('citizen-service-clear');
      const empty = document.getElementById('citizen-service-empty');
      const items = [...document.querySelectorAll('[data-service-search]')];
      const sections = [...document.querySelectorAll('.service-section')];
      const normalize = value => (value || '').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      function filter(){
        const q = normalize(input.value.trim());
        let visible = 0;
        items.forEach(item => {
          const hay = normalize(item.dataset.serviceSearch || item.textContent);
          const show = !q || hay.includes(q);
          item.hidden = !show;
          if(show) visible++;
        });
        sections.forEach(section => {
          const rows = [...section.querySelectorAll('.service-row')];
          section.hidden = !!q && rows.length && rows.every(row => row.hidden);
        });
        empty.style.display = q && visible === 0 ? 'block' : 'none';
        clear.hidden = !q;
      }
      input?.addEventListener('input', filter);
      clear?.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
      filter();
    })();
    </script>
    '''

    categories = '''
    <nav class="service-categories" aria-label="Bürgerservice Kategorien">
      <a class="service-category" href="#ausweise"><span>🪪</span><div>Ausweise & Meldewesen<small>Pass, Wohnsitz, Führungszeugnis</small></div></a>
      <a class="service-category" href="#standesamt"><span>💍</span><div>Standesamt<small>Urkunden & Eheschließung</small></div></a>
      <a class="service-category" href="#gewerbe"><span>🏢</span><div>Gewerbe<small>An-, um- und abmelden</small></div></a>
      <a class="service-category" href="#hund-ordnung"><span>🐕</span><div>Hund & Ordnung<small>Hundesteuer, Register, Ordnung</small></div></a>
      <a class="service-category" href="#wohnen"><span>🏠</span><div>Wohnen & Grundstück<small>Entwässerung, Grundsteuer, Wasser</small></div></a>
      <a class="service-category" href="#finanzen"><span>💶</span><div>Finanzen<small>SEPA, Steuern & Gebühren</small></div></a>
      <a class="service-category" href="#familie"><span>👨‍👩‍👧</span><div>Familie & Soziales<small>Kita, Schule, Rente</small></div></a>
      <a class="service-category" href="#bauen-umwelt"><span>🏗️</span><div>Bauen & Umwelt<small>Bauamt, Abfall, Infrastruktur</small></div></a>
    </nav>
    '''

    content = f'''
    <section class="page-heading compact">
      <a class="back-link" href="/">← Start</a>
      <span class="eyebrow">Rathaus digital</span>
      <h1>Bürgerservice</h1>
      <p>Anträge, Dokumente und Dienstleistungen der Samtgemeinde Eilsen – übersichtlich an einem Ort.</p>
    </section>
    {styles}
    <section class="service-lead">
      <div class="service-lead-top"><span class="service-lead-icon">🏛️</span><div><h2>Direkt zum richtigen Angebot</h2><p>Ahnsen hilft bündelt die Wege. Online-Anträge und PDFs öffnen sich immer direkt bei der zuständigen offiziellen Stelle.</p><span class="official-badge">✓ Offizielle Originalquellen verlinkt</span></div></div>
      <div class="service-lead-actions">{_external(A_Z, "Alle Leistungen A–Z", primary=True)}{_external(FORMS, "Offizieller Formularbereich")}</div>
    </section>
    <div class="service-search"><span aria-hidden="true">⌕</span><input id="citizen-service-search" type="search" autocomplete="off" placeholder="Was möchtest du erledigen?" aria-label="Bürgerservice durchsuchen"><button id="citizen-service-clear" class="service-search-clear" type="button" hidden>Löschen</button></div>
    {categories}
    <div id="citizen-service-empty" class="service-empty"><strong>Nichts gefunden.</strong><br>Versuche einen anderen Suchbegriff oder öffne alle Leistungen A–Z.</div>
    {''.join(sections)}
    <details class="resource-panel" id="formulare">
      <summary><span>📄 Alle offiziellen Formulare & PDFs</span></summary>
      <div class="resource-panel-body">{_pdf_list()}<div style="padding:12px 8px 0">{_external(FORMS, "Aktuellen Formularbereich prüfen", primary=True)}</div></div>
    </details>
    <details class="resource-panel" id="leistungen-a-z">
      <summary><span>🔎 Leistungen von A–Z</span></summary>
      <div class="resource-panel-body"><p style="margin:0 0 8px;color:var(--muted);font-size:11px;line-height:1.5">Diese Stichworte helfen bei der Suche. Die Detailinformationen bleiben auf der offiziellen Seite der Samtgemeinde.</p><div class="az-grid">{_az_chips()}</div></div>
    </details>
    <section class="rathaus-card">
      <h2>Samtgemeinde Eilsen</h2>
      <p>Bückeburger Straße 4 · 31707 Bad Eilsen</p>
      <div class="rathaus-meta"><div><small>Zentrale</small><strong>05722 / 886-0</strong></div><div><small>Öffnungszeiten</small><strong>Mo–Fr 08:00–12:00<br>Di 14:30–18:00</strong></div><div><small>Meldeamt</small><strong>meldeamt@sg-eilsen.de</strong></div><div><small>Standesamt</small><strong>standesamt@sg-eilsen.de</strong></div></div>
      <div class="rathaus-links"><a href="{escape(CONTACT, quote=True)}" target="_blank" rel="noopener noreferrer">Kontaktformular ↗</a><a href="{escape(EMAILS, quote=True)}" target="_blank" rel="noopener noreferrer">Alle Fachbereiche ↗</a></div>
    </section>
    <div class="service-legal-note"><strong>Wichtig:</strong> Ahnsen hilft ist hier der Wegweiser. Personenbezogene Angaben für Ausweise, Urkunden oder andere Verwaltungsleistungen werden nicht in diesem Bereich der PWA erfasst oder gespeichert. Für Antrag, Inhalt, Fristen und Bearbeitung ist die jeweils verlinkte offizielle Stelle maßgeblich. PDFs werden nicht kopiert, sondern direkt von der Originalquelle geöffnet.</div>
    {script}
    '''
    return page(
        "Bürgerservice",
        content,
        active="more",
        description="Anträge, Dokumente, Formulare und Dienstleistungen der Samtgemeinde Eilsen",
        body_class="citizen-service-view",
    )


@router.get("/buergerservice")
async def public_citizen_service():
    return citizen_service_page()


@router.get("/buergerinformationen")
async def public_citizen_service_legacy():
    return citizen_service_page()
