# Finanzplan PWA V3.2

Local-first Haushalts- und Finanz-PWA mit optionaler Multiuser-/Online-Schicht. Der vollständige Finanzkern bleibt offlinefähig; strukturierte Daten liegen primär in IndexedDB. Supabase ergänzt Auth, Haushalte, datensatzweisen Sync, Belege, Push und technisches Monitoring.

## Lokaler Finanzkern

- Dashboard mit Einnahmen, Ausgaben, Safe-to-Spend, Tagesbudget, Saldo, Nettovermögen, Reichweite und Prognoseband
- centgenaue Geldengine, Kontenledger, Abgleichpunkte und Umbuchungen
- Splits, Teilrückerstattungen, Belege, Händlerregeln und lernende Kategoriezuordnung
- Wiederkehrende Zahlungen mit exakten Start-/Endgrenzen
- Kategorien/Unterkategorien, Monats-, Projekt- und Urlaubsbudgets
- Sparziele, Rücklagen und Notgroschen ohne Doppelbelegung
- Verträge, Abos, Versicherungen, automatische Vertragserkennung und Kündigungsassistent
- Kredite/Schulden mit Restschuld, Tilgungsplan, Rate, Zins und Sondertilgung
- Finanzkalender, Cashflow, Soll/Ist, Monatsabschluss, Jahresvergleich und Vermögenshistorie
- CSV/XLS/XLSX/XML, QIF, OFX, MT940 und CAMT.053 mit Duplikaterkennung
- CSV/XLS/PDF/JSON-Export und verschlüsseltes `.fplan`-Vollbackup inklusive Belegen
- Papierkorb, Undo, IndexedDB-Snapshots und Reset-Schutz
- AES-256-GCM-Tresor, PBKDF2, Memory-Lock, PIN, WebAuthn/Passkey soweit vom Gerät unterstützt
- Dark Mode, Privatmodus, installierbare PWA, native/maskierbare Icons und Offline-Cache

## V3.2 – Automation & Intelligence

Die V3.2-Ausbaustufe setzt gezielt auf weniger manuelle Arbeit und mehr Produkthärtung:

1. **Providerneutraler Banking-Hub** – N26 ist als erster PSD2-Provider integriert; weitere Anbieter können registriert werden, ohne die Finanzengine umzubauen.
2. **Händlernormalisierung & Kategorie-Lernen** – wechselnde Banktexte werden auf kanonische Händler normalisiert und wiederkehrende Kategoriezuordnungen aus der Historie gelernt.
3. **Automatische Vertragserkennung** – wiederkehrende Abbuchungen werden anhand Frequenz, Betragsschwankung und Historie als Vertragskandidaten erkannt.
4. **Kündigungsassistent** – Kündigungsschreiben, PDF, vorbereitete E-Mail, Versandstatus und Beleg-/Nachweisverwaltung.
5. **Stärkerer lokaler KI-Analyst** – Kostentreiber, Sparansätze, Vertragskandidaten, Anomalien, Dubletten und Prognoseband werden ohne Cloud-Kosten erklärt.
6. **Optionale Cloud-E2EE** – Finanzdatensätze und Cloud-Belege werden clientseitig mit AES-GCM verschlüsselt. Der Haushaltsschlüssel wird aus einer Passphrase abgeleitet und nicht an Supabase übertragen.
7. **Produktionsmonitoring** – technische Fehler, Cloud-/Bank-Syncs und Laufzeiten werden mit sanierten technischen Codes erfasst; Transaktionstexte und Beträge sind keine Telemetriedaten.
8. **Zentrales Einrichtungscenter** – Banking, E2EE, KI, Monitoring und die zehn V3.2-Ziele werden an einer Stelle erklärt und gesteuert.
9. **Audit-Härtung** – bestehende Chromium/WebKit-, Offline-, Migration-, Backup-, Accessibility- und Security-Tests werden um V3.2-Regressionsprüfungen ergänzt. Ein unabhängiger Pentest/WCAG-Audit bleibt eine externe Prüfleistung.
10. **Native-/Mehrbanken-Vorbereitung** – providerneutrale Banking-Architektur und eine Capacitor-Wrapper-Konfiguration sind vorhanden; reale zusätzliche Banken bzw. App-Store-Veröffentlichungen benötigen externe Zugänge.

## Händler → Kategorie → Vertrag

V3.2 verwendet eine einheitliche Pipeline:

`Bank-/Importtext → kanonischer Händler → gelernte Händlerregel → Kategorie → Wiederholungsmuster → Vertragskandidat`

Der originale Banktext bleibt erhalten. Beispiel: `SPOTIFY AB 123456` kann als Händler `Spotify` normalisiert werden. Dadurch greifen Kategorisierung, Vertragserkennung und KI-Auswertung auf dieselbe Händleridentität zu.

## Multiuser und Cloud-E2EE

Die Supabase-Infrastruktur bietet:

- Supabase Auth
- Haushalte und Rollen `owner`, `admin`, `adult`, `limited`
- Einladungen und Row Level Security
- datensatzweisen Sync mit optimistischer Konfliktprüfung
- privaten Storage-Bucket `finance-documents`
- bidirektionalen Beleg-Sync

V3.2 ergänzt optional eine echte clientseitige E2EE-Schicht. Bei Aktivierung werden Finanzdatensätze vor dem Upload verschlüsselt und Belegdateien als verschlüsselte Binärdaten abgelegt. Ein neues Gerät prüft vor dem ersten Sync die serverseitige E2EE-Konfiguration und verlangt die Haushalts-Passphrase, bevor verschlüsselte Datensätze eingelesen werden können.

Die Passphrase bzw. der daraus abgeleitete AES-Schlüssel werden nicht an Supabase übertragen. Ohne Cloud-Login arbeitet Finanzplan weiterhin vollständig lokal.

## Server-Push und Monitoring

Push läuft über Supabase Edge Functions und einen 5-Minuten-Cron. Zusätzlich besitzt V3.2 eine RLS-geschützte `client_events`-Tabelle für sanitisierte technische Ereignisse. Haushaltsmitglieder dürfen eigene technische Events schreiben; owner/admin dürfen sie lesen. Die App entfernt E-Mail-Adressen, lange Identifikatoren und betragähnliche Angaben aus Monitoring-Meldungen, bevor eine optionale Cloud-Übertragung erfolgt.

## N26 / PSD2

Die Softwareseite der N26-Anbindung ist vorbereitet:

- Enable-Banking-Consent-Start und Callback-State
- Session-Aufbau und Kontoliste
- Saldo und paginierter Transaktionsabruf
- N26→Finanzplan-Mapping
- Händlernormalisierung und Kategoriepipeline
- Duplikatprüfung
- optionaler Kontenabgleich
- anschließende Vertrags-/Intelligence-Pipeline

**Extern noch erforderlich:** persönliche Enable-Banking-Anwendungs-ID und privater Schlüssel sowie anschließend einmalig der offizielle N26-Consent. Bankpasswörter werden nicht in Finanzplan gespeichert.

## KI

Drei Ebenen bleiben möglich:

- **Lokaler deterministischer Analyst:** immer verfügbar, offline und ohne API-Kosten. V3.2 kann u. a. Monatsveränderungen, Kostentreiber, Sparansätze, Verträge, Anomalien und Prognosen erklären.
- **Geräte-KI:** wird genutzt, falls der Browser eine geeignete lokale `LanguageModel`-API bereitstellt.
- **Cloud-KI:** optional über die Edge API; die Finanzengine berechnet Zahlen deterministisch, das Modell erklärt einen vorbereiteten Kontext. Ein externer Modell/API-Key ist dafür erforderlich.

## Native Vorbereitung

`finanzplan/native/` enthält eine Capacitor-Konfiguration als Vorbereitung für eine spätere Android-/iOS-Hülle. Die PWA bleibt die fachliche Quelle, sodass keine zweite Finanzengine gepflegt werden muss. App-Store-Konten, Signaturen, Provisioning und Store-Review sind externe Voraussetzungen und gehören nicht ins Repository.

## Sicherheit

- IndexedDB ist primärer strukturierter Datenspeicher.
- Der Legacy-Klartextschlüssel `finanzplan:data:v1` sowie alte LocalStorage-Snapshot-/Undo-Schlüssel werden beim V3.2-Start und nach jeder Speicherung entfernt.
- Kern-Geldwerte besitzen eine Integer-Cent-Schicht.
- Tresor und Vollbackup verwenden AES-GCM.
- Optionale Cloud-E2EE verschlüsselt Finanzdatensätze und Belege clientseitig.
- Supabase verwendet RLS; der private Dokument-Bucket ist nicht öffentlich.
- Banking-/Cloud-/KI-Endpunkte werden vom Service Worker nicht gecacht.
- Render liefert CSP, HSTS, `nosniff` und Referrer-Policy.
- Der Supabase Security Advisor wird nach Datenbankschemaänderungen geprüft.

## Tests

GitHub Actions prüft auf dem V3.2-Branch und später auf Produktion:

- Syntax aller Finanzplan-/Backend-JavaScript-Module und Finanzregression
- Baseline- und Accounting-Härtungsflows
- Chromium Desktop und WebKit Mobile
- IndexedDB, Backup/Restore und 10.000 zusätzliche Buchungen
- V2→V3-Migration und installierten PWA-Modus
- Accessibility und Offline-Neustart
- V3.1-Premiumregression
- V3.2 Händlerlernen, Vertragserkennung, Kündigungstext, Banking-Hub, KI-Erweiterung, Monitoring-Sanitizing und E2EE-Kryptobasis
- exakten V3.2-Service-Worker auf Produktion plus Live-Security-Header nach einem späteren Merge auf `finanzplan`

## Lokal starten

```bash
python3 -m http.server 8080 --directory finanzplan
```

Dann `http://localhost:8080/` öffnen.

## Produktiv

Die aktuell produktive PWA läuft auf Render vom Branch `finanzplan`. V3.2 wird erst auf diesen Branch übernommen, wenn die vollständige V3.2-Testmatrix auf dem Prüfbranch grün ist. Danach verlangt der Produktionsworkflow ausdrücklich den Service-Worker `finanzplan-v3.2.0` und prüft die Live-Security-Header.

## Externe Restpunkte

V3.2 kann Software und Infrastruktur vorbereiten, aber folgende Vorgänge benötigen legitimerweise Dritte:

- N26-Live-Sync: Enable-Banking-Zugang + privater Schlüssel + offizieller N26-Consent
- generative Cloud-KI: externer Modell/API-Key
- unabhängiger Penetrationstest bzw. formale WCAG-Prüfung
- zusätzliche reale PSD2-Bankprovider
- App-Store-Konten, Signing und Store-Review

Diese Punkte werden nicht als intern erledigt ausgegeben, solange die jeweiligen externen Voraussetzungen fehlen.
