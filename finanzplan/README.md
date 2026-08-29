# Finanzplan PWA V3.2

Local-first Haushalts- und Finanz-PWA. Der komplette Finanzkern bleibt offlinefähig; strukturierte Daten liegen primär in IndexedDB. Supabase erweitert die PWA optional um echte Benutzerkonten, Multiuser-Sync, Belege, Hintergrund-Push, Monitoring sowie die sichere Backend-Schicht für Banking und optionale Cloud-KI.

## Lokaler Finanzkern

- Dashboard mit Einnahmen, Ausgaben, Safe-to-Spend, Tagesbudget, Saldo, Nettovermögen, Reichweite und Prognoseband
- centgenaue Geldengine, Kontenledger, Abgleichpunkte und Umbuchungen
- Splits, Teilrückerstattungen, Händlerregeln und Belege
- Wiederkehrende Zahlungen mit exakten Start-/Endgrenzen
- Kategorien/Unterkategorien, Monats-, Projekt- und Urlaubsbudgets
- Sparziele, Rücklagen und Notgroschen ohne Doppelbelegung
- Verträge, Abos, Versicherungen, Kündigungsfristen und automatische Rücklagen
- Kredite/Schulden mit Restschuld, Tilgungsplan, Rate, Zins und Sondertilgung
- Finanzkalender, Cashflow, Soll/Ist, Monatsabschluss und Jahresstatistik
- CSV/XLS/XLSX/XML, QIF, OFX, MT940 und CAMT.053 Import mit Duplikaterkennung
- CSV/XLS/PDF/JSON-Export und verschlüsseltes `.fplan`-Vollbackup inklusive Belegen
- Papierkorb, Undo, IndexedDB-Snapshots und Reset-Schutz
- AES-256-GCM-Tresor, PBKDF2, Memory-Lock, PIN, WebAuthn und PRF-Cold-Start-Passkey wo vom Gerät unterstützt
- Dark Mode, Privatmodus, installierbare PWA, native/maskierbare Icons und Offline-Cache

## V3.2 – die zehn Automation-&-Intelligence-Ausbaupunkte

1. **N26 Live-Banking** – providerneutraler Banking-Hub und komplette N26/Enable-Banking-Bridge. Software fertig; persönlicher Enable-Banking-Zugang und einmaliger N26-Consent bleiben externe Voraussetzungen.
2. **Händler & Kategorien** – Händlernormalisierung plus lernende Kategorisierung mit Konfidenzwert aus bestätigten historischen Buchungen.
3. **Automatische Vertragserkennung** – wiederkehrende, ausreichend stabile Abbuchungen werden als Vertragskandidaten erkannt.
4. **Kündigungsassistent** – Kündigungstext, PDF, vorbereitete E-Mail, Versandstatus und Nachweis-/Dokumentenablage.
5. **KI-Finanzassistent** – deutlich erweiterter kostenloser lokaler Analyst; Geräte-KI bei Browserunterstützung; optionale Cloud-KI über die sichere Backend-Schicht.
6. **Cloud-E2EE** – Finanzdatensätze und Belegdateien können clientseitig mit einer Haushalts-Passphrase Ende-zu-Ende verschlüsselt werden. Supabase erhält dann nur Ciphertext.
7. **Produktionsmonitoring** – sanitizierte Runtime-, Sync- und Banking-Ereignisse; Admin-/Owner-Sicht über RLS.
8. **UX & Onboarding** – zentrales V3.2-Einrichtungscenter für Banking, E2EE, Push, KI, Monitoring und den Status aller zehn Ausbaupunkte.
9. **Audit-Härtung** – automatisierte Security-, Browser-, Offline-, Accessibility-, Migrations-, Backup- und Massendatentests plus Supabase Security/Performance Advisor. Ein echter externer Penetrationstest und manueller WCAG-2.2-AA-Screenreader-Test bleiben externe Freigaben.
10. **Weitere Banken & Native Readiness** – Banking-Provider sind von der Finanzengine entkoppelt; ein Capacitor-Wrapper ist für spätere Android/iOS-Verteilung vorbereitet. Weitere reale Banken und Store-Veröffentlichung benötigen Provider-/Store-Zugänge.

## Multiuser & Ende-zu-Ende-Verschlüsselung

Die Supabase-Infrastruktur enthält:

- Supabase Auth
- Haushalte und Rollen `owner`, `admin`, `adult`, `limited`
- Einladungen
- Row Level Security
- datensatzweisen Sync statt Ganzdaten-Overwrite
- optimistische Versionsprüfung und Konfliktbehandlung
- bidirektionalen Beleg-Sync
- privaten Storage-Bucket `finance-documents` mit 20 MB je Datei
- optionale clientseitige E2EE für strukturierte Cloud-Daten und Cloud-Belege

Die E2EE-Passphrase wird nicht an Supabase übertragen. Ohne Passphrase können verschlüsselte Cloud-Daten auf einem neuen Gerät bewusst nicht entschlüsselt werden. Ohne Cloud-Login arbeitet Finanzplan weiterhin vollständig lokal.

## Händlerlernen, Verträge und Kündigung

V3.2 normalisiert typische Händlerbezeichnungen und kann aus mehreren bestätigten Buchungen eine Kategoriezuordnung lernen. Wiederkehrende Ausgaben werden anhand von Buchungsabständen und stabilen Beträgen als mögliche Verträge erkannt. Ein erkannter Kandidat wird nicht blind aktiviert, sondern kann bewusst übernommen werden.

Für aktive Verträge kann Finanzplan ein Kündigungsschreiben erzeugen, als PDF speichern, eine vorausgefüllte E-Mail öffnen und später einen Kündigungs-/Versandnachweis als Dokument hinterlegen.

## Server-Push

Push läuft über Supabase und benötigt keinen zweiten Render-Web-Service:

- Web-Push-Empfänger im Service Worker
- PushManager-Subscription in der PWA
- serverseitige Subscription-Speicherung
- JWT-geschützte Benutzer-API `finanzplan-api`
- separater Dispatcher `finanzplan-push-dispatch`
- interner Supabase-Cron alle 5 Minuten
- Erinnerungen für geplante Zahlungen, Budgets und Kündigungsfristen

V3.2 hat den Dispatcher zusätzlich gehärtet: Er akzeptiert keine anonymen Aufrufe mehr. Ein Aufruf ohne internen Dispatch-Token liefert HTTP 401, der interne Cron-Pfad HTTP 200. Private VAPID-/Dispatch-Schlüssel stehen nicht im Edge-Function-Quelltext.

## N26 / PSD2

Die N26-Anbindung ist softwareseitig vollständig bis zur externen Provider-Aktivierung vorbereitet:

- Enable-Banking-Consent-Start
- HMAC-geschützter, zeitlich begrenzter Callback-State
- Session-Aufbau
- Kontoliste
- Saldo
- paginierter Transaktionsabruf
- N26→Finanzplan-Mapping
- Duplikatprüfung
- Händlernormalisierung und lernende Kategorisierung
- anschließende Vertragserkennung
- optionaler Kontenabgleich

Banking-Secrets liegen ausschließlich serverseitig. Das N26-Passwort wird nicht in Finanzplan gespeichert. Noch erforderlich sind ein persönlicher Enable-Banking-App-Zugang/Private-Key und danach einmal der offizielle N26-Consent.

## KI

Drei Ebenen bleiben bewusst getrennt:

- **Lokaler deterministischer Analyst:** immer verfügbar, offline und ohne API-Kosten. V3.2 beantwortet zusätzlich Spar-, Monatsvergleich-, Vertrags-, Anomalie- und Prognosefragen.
- **Geräte-KI:** wird benutzt, wenn der Browser eine lokale `LanguageModel`-API bereitstellt; sonst automatischer Fallback.
- **Cloud-KI:** optional über `finanzplan-api`. Die Finanzengine berechnet die autoritativen Zahlen; das Modell erklärt nur den aggregierten Kontext. Dafür ist ein externer Modell/API-Key nötig.

## Produktionsmonitoring

V3.2 protokolliert technische Ereignisse wie Runtime-Fehler, fehlgeschlagene Cloud-Synchronisierung oder Banking-Fehler. Vor einer optionalen Serverübertragung werden E-Mail-Adressen, lange Nummern und geldbetragähnliche Werte aus Meldungen entfernt. Owner/Admin können Cloud-Diagnoseereignisse lesen; normale Haushaltsmitglieder können keine fremden Monitoringdaten abrufen.

## Supabase-Härtung

- Security Advisor: keine Security-Lints im gehärteten V3.2-Zustand
- RLS-Policies verwenden statementweit gecachte Auth-Werte statt unnötiger Auth-Auswertung pro Zeile
- doppelte permissive Policies für Einladungen/Mitglieder wurden zusammengeführt
- fehlende Foreign-Key-Indizes wurden ergänzt
- Server-Secrets liegen in `private.runtime_secrets`; `anon` und `authenticated` haben keinen Zugriff
- VAPID-Private-Key, Banking-State-HMAC und Push-Dispatch-Token sind nicht im Repository
- verbleibende Performance-Advisor-Hinweise betreffen lediglich frisch angelegte, erwartungsgemäß noch unbenutzte Indizes

## Native Readiness

`finanzplan/native/` enthält eine Capacitor-Konfiguration als Vorbereitung für eine spätere Android-/iOS-Hülle. Die PWA bleibt die gemeinsame Fachlogik; native Distribution soll keine zweite Finanzengine erzeugen. Echte Store-Releases erfordern externe Entwicklerkonten, Signaturen/Provisioning und Store-Prüfungen.

## Tests

GitHub Actions prüft unter anderem:

- Syntax aller Finanzplan- und Backend-JavaScript-/MJS-Module
- Finanz-Regressionslogik
- Baseline- und Accounting-Härtungsflows
- Chromium Desktop und WebKit Mobile
- IndexedDB-Persistenz, Backup/Restore und 10.000 zusätzliche Buchungen
- V2→V3-Migration und installierten PWA-Modus
- Accessibility-/Offline-Smoke
- V3.1-Premiumregression
- QIF, OFX, MT940 und CAMT.053
- V3.2-Händlerlernen und automatische Vertragserkennung
- Kündigungslogik
- E2EE-Kryptografie
- Monitoring-Sanitisierung
- providerneutralen Banking-Hub
- erweiterten lokalen KI-Analysten
- V3.2-Offlinestart

## Produktiv

Statische PWA auf Render:

- Branch `finanzplan`
- Root `finanzplan`
- Publish `.`
- Security-/Cache-Header werden im Live-Smoke geprüft

Supabase übernimmt Multiuser, Storage, Monitoring, Push und die sichere Banking-/KI-Backend-Schicht.

## Noch externe Aktivierung nötig

Nur zwei Online-Funktionen benötigen weiterhin Zugangsdaten eines Drittanbieters:

1. **N26 Auto-Sync:** Enable-Banking-App-ID + privater Schlüssel und danach einmaliger N26-Consent.
2. **Generative Cloud-KI:** optionaler Modell/API-Key; ohne ihn bleibt der erweiterte lokale Analyst aktiv.

Für eine spätere öffentliche Vermarktung kommen zusätzlich externe Freigabeschritte hinzu: professioneller Penetrationstest, vollständiger manueller WCAG-/Screenreader-Audit, Store-Developer-Konten und bei weiteren Banken entsprechende Providerfreigaben.
