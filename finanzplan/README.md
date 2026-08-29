# Finanzplan PWA V3.1

Local-first Haushalts- und Finanz-PWA. Der vollständige Finanzkern bleibt offlinefähig; strukturierte Daten liegen primär in IndexedDB. Optional erweitert die bereits eingerichtete Supabase-Schicht die PWA um echte Benutzerkonten, Multiuser-Sync, Belege und Hintergrund-Push.

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
- optionaler AES-256-GCM-Tresor, PBKDF2, Memory-Lock, PIN, WebAuthn und PRF-Cold-Start-Passkey wo vom Gerät unterstützt
- Dark Mode, Privatmodus, installierbare PWA, native/maskierbare Icons und Offline-Cache

## V3.1 Premium-Ausbau

1. **Finanz-Autopilot** – Safe-to-Spend, Verpflichtungen, Auffälligkeiten und priorisierte Maßnahmen.
2. **Prognoseband** – konservatives, Basis- und optimistisches Monatsende.
3. **Anomalien/Dubletten** – ungewöhnliche Beträge und mögliche Doppelbuchungen.
4. **Vertragsprüfung** – Kündigungsfristen und laufende Kosten priorisiert.
5. **Automatischer Monatsbericht** – Kennzahlen, Kategorien, Veränderungen und Nettovermögen historisiert.
6. **Jahresvergleich** – Vorjahr und optional inflationsbereinigte Betrachtung.
7. **Bankdateiformate** – QIF, OFX, MT940 und CAMT.053 zusätzlich zu CSV/XLSX.
8. **Portfolio/Vermögenswerte** – Immobilien, Wertpapiere, Fahrzeuge, Edelmetalle und sonstige Werte mit Historie.
9. **Passkey-Härtung** – PRF-basierter Cold-Start-Unlock des Tresorschlüssels auf kompatiblen Geräten.
10. **Qualitätssicherung** – Chromium/WebKit, Offline, Migration, IndexedDB, Backup/Restore, 10k-Buchungen, Accessibility und Premium-Regression.

## Multiuser – Supabase

Die produktive Supabase-Infrastruktur ist eingerichtet:

- Supabase Auth
- Haushalte und Rollen `owner`, `admin`, `adult`, `limited`
- Einladungen
- Row Level Security
- datensatzweiser Sync statt Ganzdaten-Overwrite
- optimistische Versionsprüfung und Konfliktbehandlung
- bidirektionaler Beleg-Sync
- privater Storage-Bucket `finance-documents` (20 MB je Datei)

Der Supabase Security Advisor meldet im gehärteten Zustand keine Security-Lints. Die öffentliche Projekt-URL und der Publishable Key dürfen im Client stehen; Service-Role-/Bank-/KI-Geheimnisse werden nicht in die PWA geschrieben.

Ohne Cloud-Login arbeitet Finanzplan weiterhin vollständig lokal.

## Server-Push

Push ist serverseitig eingerichtet und benötigt keinen separaten Render-Web-Service:

- Web-Push-Empfänger im Service Worker
- PushManager-Subscription in der PWA
- serverseitige Subscription-Speicherung
- Supabase Edge Function `finanzplan-api`
- separater Edge-Dispatcher `finanzplan-push-dispatch`
- aktiver Supabase-Cron alle 5 Minuten
- Erinnerungen für geplante Zahlungen, Budgets und Kündigungsfristen

Die Dispatcher-Funktion wurde serverseitig mit HTTP 200 getestet. Ein echtes Handy erhält Nachrichten, nachdem der Benutzer sich in der PWA bei Cloud anmeldet und Push einmal aktiviert.

## N26 / PSD2

Die N26-Anbindung ist technisch bis zur Provider-Aktivierung implementiert:

- Enable-Banking-Consent-Start
- manipulationsgeschützter Callback-State
- Session-Aufbau
- Kontoliste
- Saldo
- paginierter Transaktionsabruf
- N26→Finanzplan-Mapping
- Duplikatprüfung und Händlerregeln
- optionaler Kontenabgleich

Der Client verwendet die Supabase Edge API. **Nicht im Repository vorhanden und noch extern erforderlich:** persönliche Enable-Banking-Anwendungs-ID und privater Schlüssel. Danach muss N26 einmal über den offiziellen Consent-Flow freigegeben werden. Das N26-Passwort wird nicht in Finanzplan gespeichert.

## KI

Drei Ebenen:

- **Lokaler deterministischer Analyst:** immer verfügbar, offline, 0 € API-Kosten.
- **Geräte-KI:** wird genutzt, wenn der Browser eine lokale `LanguageModel`-API anbietet; sonst Fallback auf den lokalen Analysten.
- **Cloud-KI:** optional über `finanzplan-api`; die Finanzengine berechnet die Zahlen, das Modell erklärt nur einen aggregierten Kontext. Dafür ist ein externer API-Key erforderlich.

Cloud-KI ist optional; ohne API-Key bleibt Finanzplan vollständig benutzbar.

## Supabase Edge API

Die aktuell produktiv angelegten Funktionen sind:

- `finanzplan-api` – JWT-geschützte Benutzer-API für Banking, KI und Push
- `finanzplan-push-dispatch` – idempotenter Dispatcher, der nur bereits serverseitig fällige Push-Jobs versendet

Die PWA ist auf die Supabase Edge API vorkonfiguriert; eine Backend-URL muss nicht manuell eingetragen werden.

`finanzplan-backend/` bleibt als alternative Node/Express-Implementierung und Referenz für Self-Hosting/Render erhalten, ist für die jetzige private Supabase-Installation aber nicht erforderlich.

## Tests

GitHub Actions prüft:

- Syntax aller Finanzplan- und Backend-JavaScript-/MJS-Module
- Finanz-Regressionslogik
- Baseline- und Accounting-Härtungsflows
- Unterkategorien, Rollen, Rücklagen, relationales Restore und Beleg-Papierkorb
- Chromium Desktop und WebKit Mobile
- IndexedDB-Persistenz, Backup/Restore und 10.000 zusätzliche Buchungen
- V2→V3-Migration und installierten PWA-Modus
- Accessibility-/Offline-Smoke
- V3.1-Autopilot, Asset-Nettovermögen, Monatsbericht
- QIF, OFX, MT940 und CAMT.053
- Supabase-Public- und Edge-Backend-Konfiguration

## Lokal starten

```bash
python3 -m http.server 8080 --directory finanzplan
```

Dann `http://localhost:8080/` öffnen.

## Produktiv

Statische PWA auf Render:

- Branch `finanzplan`
- Root `finanzplan`
- Publish `.`
- Security-/Cache-Header sind im produktiven Render-Service gesetzt und live getestet.

Supabase übernimmt Multiuser, Storage und Hintergrund-Push.

## Noch externe Aktivierung nötig

Nur zwei optionale Online-Bereiche benötigen noch Zugangsdaten eines Drittanbieters:

1. **N26 Auto-Sync:** Enable-Banking-App-ID + privater Schlüssel und danach einmaliger N26-Consent.
2. **Generative Cloud-KI:** optionaler Modell/API-Key; ohne ihn bleibt der lokale Analyst aktiv.

Damit fehlen auf Software-/Infrastrukturseite keine weiteren lokalen Premium-Module; die beiden Punkte sind externe Provider-Freigaben.
