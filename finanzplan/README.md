# Finanzplan PWA

Moderne local-first Haushalts- und Finanz-PWA im Neo-Design. Die App läuft ohne Build-Schritt als statische PWA und speichert Finanzdaten standardmäßig lokal im Browser.

## Enthalten

- Dashboard mit Einnahmen, Ausgaben, Saldo, Budget, Nettovermögen und Monatsprognose
- Konten, Transaktionen, regelmäßige Einnahmen/Fixkosten, Umbuchungen
- Kategorien und Unterkategorien, Budgets, Projekt-/Urlaubsbudgets
- Sparziele, Rücklagen, Notgroschen, Kredite/Schulden
- Verträge, Abos, Versicherungen und Jahreskosten
- Finanzkalender, Cashflow-Prognose, Monatsabschluss, Jahresstatistik
- Finanz-Score und lokaler Analyseassistent
- Szenario- und Anschaffungsrechner
- Belege/Dokumente lokal via IndexedDB
- CSV/Excel-kompatibler/PDF/JSON Export, CSV/JSON Import, Snapshots
- Dark Mode, Privatmodus, lokaler PIN, responsive PWA, Offline-Cache
- vorbereitete Adapter für Mehrbenutzer/Cloud, PSD2/Open Banking und externe KI

## Lokal starten

Da Service Worker nur über HTTP(S) funktionieren:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080/finanzplan/` öffnen.

## Render

Branch: `finanzplan`

Root Directory: `finanzplan`

Build Command: leer oder `echo "no build"`

Publish Directory: `.`

Alternativ kann die `render.yaml` verwendet werden.

## Datenschutz

Die Kernversion ist local-first. Bankzugriff, echter Multiuser-Cloud-Sync, serverseitige Push-Nachrichten und generative KI sind bewusst nicht mit einem externen Anbieter verdrahtet, solange dafür keine konkreten Provider/Zugangsdaten gewählt wurden.