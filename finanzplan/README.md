# Finanzplan PWA v2.2

Moderne local-first Haushalts- und Finanz-PWA im Neo-Design. Die App läuft ohne Build-Schritt als statische PWA und speichert Finanzdaten standardmäßig lokal im Browser. Optional können Finanzdaten und Belege in einem AES-GCM-Tresor verschlüsselt werden.

## Enthalten

- Dashboard mit Einnahmen, Ausgaben, Safe-to-Spend, Tagesbudget, Saldo, Nettovermögen, Reichweite und Monatsprognose
- Konten mit Eröffnungssaldo, Ledger, Abgleichpunkten und echten Umbuchungen
- Einnahmen/Ausgaben, Splits, Rückerstattungen, Händlerregeln und Belege
- Wiederkehrende Zahlungen: wöchentlich, 14-tägig, monatlich, quartalsweise, halbjährlich, jährlich
- Kategorien/Unterkategorien, Monatsbudgets und Projekt-/Urlaubsbudgets
- Sparziele als echte Kontotöpfe, Rücklagen und Notgroschen
- Verträge, Abos, Versicherungen, Kündigungsfristen und automatische Rücklagen
- Kredite/Schulden mit Restschuld, Tilgungsplan, Rate, Zins und Sondertilgung
- Finanzkalender, Cashflow-Prognose, Soll/Ist, Monatsabschluss und Jahresstatistik
- Preissteigerungs- und Abo-Erkennung, Datenintegritätsprüfung und Finanz-Score
- Szenario-, Anschaffungs- und Stress-Rechner
- CSV/XLS/XLSX/XML-Import mit Vorschau, Mapping, deutschen Zahlen/Daten und Duplikaterkennung
- CSV/XLS/PDF/JSON-Export sowie verschlüsseltes `.fplan`-Vollbackup inklusive Belegen
- Papierkorb, Undo, lokale Snapshots und Reset-Schutz für Belege
- optionaler AES-256-GCM-Tresor, PBKDF2, Auto-Lock/Memory-Lock, PIN und optional WebAuthn
- Dark Mode, Privatmodus, maskierbares PWA-Icon, responsive Mobile-PWA und Offline-Cache
- verschlüsselter Ganzdaten-Sync mit ETag-Konfliktschutz für private GET/PUT-Endpunkte
- vorbereitete Client-Schnittstellen für echtes Web Push, PSD2/Open Banking, Multiuser-Backend und externe generative KI

## Tests

Die GitHub-Actions-Suite prüft:

- Syntax aller Finanzplan-JavaScript-Module
- reine Finanz-Regressionslogik (Geld-/Datumsformate, Monatsende, Wiederholungen, Fingerprints, Tilgung, Safe-to-Spend)
- Baseline-Chromium-Flow auf 390×844
- Härtungs-Flow für Same-Account-Transfer, Split/Refund, Contract/Debt Restore, Rücklagen-Rollback, Safe-to-Spend, Sparallokationen, Vollbackup und Tresor-Lock
- Extra-Edge-Flow für Unterkategorien, Papierkorb-Belege, lokale Rollen und Versionspersistenz

## Lokal starten

Da Service Worker nur über HTTP(S) funktionieren:

```bash
python3 -m http.server 8080 --directory finanzplan
```

Dann `http://localhost:8080/` öffnen.

## Render

Branch: `finanzplan`

Root Directory: `finanzplan`

Build Command: leer oder `echo "no build"`

Publish Directory: `.`

`render.yaml` enthält zusätzlich empfohlene Security-Header für eine Blueprint-verwaltete Render Static Site.

## Externe Restpunkte

Vier Bereiche benötigen für die volle Funktion weiterhin externe Infrastruktur:

1. echte getrennte Benutzerkonten und gleichzeitiges konfliktfreies Multiuser-Merging,
2. zuverlässiges Web Push bei vollständig geschlossener PWA,
3. echter PSD2/Open-Banking-Zugriff über einen lizenzierten Provider,
4. freie generative KI-Antworten über ein externes KI-Modell.

Die lokale Finanzlogik funktioniert ohne diese Dienste.
