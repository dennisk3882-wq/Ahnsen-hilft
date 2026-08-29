# Finanzplan PWA v3.1

Local-first Haushalts- und Finanz-PWA im Neo-Design. Der Finanzkern bleibt vollständig offlinefähig; strukturierte Daten liegen primär in IndexedDB. Optional können Finanzdaten und Belege lokal im AES-GCM-Tresor verschlüsselt sowie über eine getrennte Cloud-/Backend-Schicht erweitert werden.

## Lokaler Finanzkern

- Dashboard mit Einnahmen, Ausgaben, Safe-to-Spend, Tagesbudget, Saldo, Nettovermögen und Reichweite
- centgenaue Geldengine, Kontenledger, Abgleichpunkte und echte Umbuchungen
- Einnahmen/Ausgaben, Splits, Teilrückerstattungen, Händlerregeln und Belege
- Wiederkehrende Zahlungen von wöchentlich bis jährlich mit exakten Start-/Endgrenzen
- Kategorien/Unterkategorien, Monatsbudgets und Projekt-/Urlaubsbudgets
- Sparziele als Kontotöpfe, Rücklagen und Notgroschen ohne Doppelbelegung
- Verträge, Abos, Versicherungen, Kündigungsfristen und reversible automatische Rücklagen
- Kredite/Schulden mit Restschuld, Tilgungsplan, Rate, Zins und Sondertilgung
- Finanzkalender, Cashflow-Prognose, Soll/Ist, Monatsabschluss und Jahresstatistik
- CSV/XLS/XLSX/XML sowie QIF, OFX, MT940 und CAMT.053 Import mit Duplikaterkennung
- CSV/XLS/PDF/JSON-Export und verschlüsseltes `.fplan`-Vollbackup inklusive Belegen
- Papierkorb, Undo, IndexedDB-Snapshots und Reset-Schutz
- optionaler AES-256-GCM-Tresor, PBKDF2, echter Memory-Lock, PIN und WebAuthn/Passkey-Unterstützung
- Dark Mode, Privatmodus, installierbare Mobile-PWA, native/maskierbare Icons und Offline-Cache

## V3.1 Premium-Ausbau

1. **Finanz-Autopilot:** führt Safe-to-Spend, anstehende Verpflichtungen, Auffälligkeiten und Handlungshinweise zusammen.
2. **Prognoseband:** konservatives, Basis- und optimistisches Monatsende statt einer scheinexakten Einzelprognose.
3. **Anomalie-/Dubletten-Erkennung:** erkennt ungewöhnliche Beträge und potenzielle Doppelbuchungen.
4. **Vertragsprüfung:** priorisiert Kündigungsfristen und laufende Kosten.
5. **Automatischer Monatsbericht:** Kennzahlen, Top-Kategorien, Veränderungen und Nettovermögen werden historisiert.
6. **Jahresvergleich:** aktuelles Jahr gegen Vorjahr, optional inflationsbereinigt.
7. **Erweiterte Bankimporte:** QIF, OFX, MT940 und CAMT.053 ergänzen CSV/XLSX.
8. **Portfolio & weitere Vermögenswerte:** Immobilien, Wertpapiere, Fahrzeuge, Edelmetalle und sonstige Werte mit Bewertungsverlauf.
9. **Passkey-Härtung:** WebAuthn-Gerätefreigabe; Cold-Start-Komfort hängt von der jeweiligen Browser-/Authenticator-Unterstützung ab.
10. **Qualitätssicherung:** Chromium + WebKit, Offline, Migration, IndexedDB, Backup/Restore, große Datenmenge, Accessibility-Smoke und V3.1-Premium-Regression.

## Optionale Cloud-Architektur

### Supabase Multiuser

Das V3.1-Clientmodul unterstützt Supabase Auth, Haushalte, Rollen (`owner`, `admin`, `adult`, `limited`), Einladungen, datensatzweisen Sync, optimistische Versionsprüfung, Konfliktauflösung und Beleg-Sync.

Das Produktionsschema befindet sich unter `finanzplan-backend/supabase/` und verwendet Row Level Security. Die aktuell eingerichtete Supabase-Instanz wurde zusätzlich mit dem Supabase Security Advisor geprüft; der gehärtete Stand meldet keine Security-Lints.

Der lokale Finanzplan funktioniert weiterhin ohne Anmeldung und ohne Cloud.

### N26 / PSD2

Die PWA enthält den N26-Client; das Node-Backend enthält die Enable-Banking-Bridge für Consent, Sitzungsaufbau, Saldo und Transaktionsabruf. Bankzugangsdaten werden nicht in der PWA gespeichert. Die Funktion wird erst aktiv, wenn ein Enable-Banking-Anwendungszugang und dessen privater Schlüssel im Backend hinterlegt sind.

### Web Push

Client, Service-Worker-Empfänger, VAPID-Backend, Abonnementverwaltung und Reminder-Queue sind implementiert. Aktiv wird echtes Push bei geschlossener PWA erst nach Deployment des Backends und Einrichtung der VAPID-/Dispatcher-Secrets.

### KI

Drei Modi sind vorgesehen:

- **Lokaler deterministischer Analyst:** immer verfügbar, keine API-Kosten.
- **Geräte-KI:** nutzt eine native Browser-`LanguageModel`-API, falls das jeweilige Gerät sie anbietet; sonst automatischer Fallback auf den lokalen Analysten.
- **Cloud-KI:** optional über das eigene Backend. Die Finanzengine berechnet die Zahlen lokal; an das Modell geht ein aggregierter strukturierter Kontext. Ein API-Key wird ausschließlich serverseitig gespeichert.

## Backend

`finanzplan-backend/` ist ein separates Node/Express-Web-Service-Projekt für:

- Enable Banking / N26
- optionale Cloud-KI
- Web Push
- serverseitige Supabase-Prüfung

Alle geheimen Werte gehören ausschließlich in Render-Umgebungsvariablen. Insbesondere dürfen `SUPABASE_SERVICE_ROLE_KEY`, `ENABLE_BANKING_PRIVATE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`, `STATE_SECRET` und `CRON_SECRET` niemals in die PWA oder das Repository geschrieben werden.

Für eine private Instanz kann `ALLOWED_EMAILS` gesetzt werden, sodass nur freigegebene Cloud-Konten das Backend für Banking/KI/Push verwenden dürfen.

## Tests

Die GitHub-Actions-Suite prüft unter anderem:

- Syntax aller Finanzplan- und Backend-JavaScript-/MJS-Module
- reine Finanz-Regressionslogik
- Baseline- und Accounting-Härtungsflows
- Unterkategorien, Rollen, Rücklagen und Beleg-Papierkorb
- Chromium Desktop und WebKit Mobile
- IndexedDB-Persistenz und Backup/Restore
- Skalierung mit 10.000 zusätzlichen Buchungen
- V2→V3-Migration und installierten PWA-Modus
- Accessibility-/Offline-Smoke
- V3.1-Autopilot, Asset-Nettovermögen, QIF/OFX und Offline-Persistenz

## Lokal starten

```bash
python3 -m http.server 8080 --directory finanzplan
```

Dann `http://localhost:8080/` öffnen.

Backend separat:

```bash
cd finanzplan-backend
npm install
npm start
```

## Render

Statische PWA:

- Branch: `finanzplan`
- Root Directory: `finanzplan`
- Publish Directory: `.`

Optionales API-Backend:

- Root Directory: `finanzplan-backend`
- Runtime: Node
- Free-Plan ist für die private Nutzung grundsätzlich vorgesehen; Kaltstarts sind möglich.
- `finanzplan-backend/render.yaml` enthält die Blueprint-Grundkonfiguration, jedoch keine geheimen Schlüssel.

## Noch externe Aktivierung nötig

Die Softwareseite ist vorbereitet, aber diese Funktionen können ohne externe Zugangsdaten nicht real ausgeführt werden:

1. **N26 Auto-Sync:** Enable-Banking-Anwendungs-ID und privater Schlüssel + einmaliger N26-Consent.
2. **Cloud-KI:** optionaler API-Key/Billing; ohne ihn bleibt der kostenlose lokale Analyst aktiv.
3. **Web Push im Hintergrund:** VAPID-Schlüsselpaar, Backend-Deployment und Dispatcher-Secret.
4. **Backend:** Render-Web-Service mit den benötigten Secrets.

Supabase-Datenbank und RLS-Struktur sind bereits eingerichtet; die PWA selbst bleibt auch ohne sämtliche externen Dienste voll lokal nutzbar.
