# Ahnsen hilft

„Ahnsen hilft“ ist eine installierbare Progressive Web App (PWA) für Ahnsen.
Sie bündelt digitale Bürgerdienste in einer modernen, für Smartphones
optimierten Oberfläche.

## Aktueller Funktionsumfang

- installierbare PWA mit Manifest, App-Icons und Service Worker
- moderne Startseite im Ahnsen-Dorfdesign
- direkter Mängelmelder mit Kategorie, Ort, Beschreibung, Foto und optionalem
  Gerätestandort
- sofortige Vorgangsnummer und öffentliche Statusabfrage
- Veranstaltungen
- DGH-Verfügbarkeiten
- Müllabfuhrtermine und ICS-Kalenderexport
- Vereine, Aktuelles, Feuerwehr, Ansprechpartner und Bürgerinformationen
- bestehender geschützter Verwaltungsbereich für Mängel, Veranstaltungen, DGH,
  Mülltermine und Gemeindeseiten-Inhalte

Der bisherige WhatsApp-Bot und der WhatsApp-Erinnerungs-Cronjob sind im
PWA-Betrieb deaktiviert. Bestehende Verwaltungsdaten und Datenbanktabellen
bleiben erhalten.

## Lokaler Start

1. Python 3.11 installieren.
2. Abhängigkeiten installieren: `pip install -r requirements.txt`
3. Variablen aus `.env.example` sicher setzen.
4. Anwendung starten:

```bash
uvicorn pwa_main:app --host 0.0.0.0 --port 10000
```

Die Bürger-PWA ist unter `/` erreichbar. Der Verwaltungszugang liegt unter
`/verwaltung`.

## Deployment

`render.yaml` startet die PWA über `pwa_main:app`. Der frühere
WhatsApp-Cronjob ist nicht mehr Teil des Render-Blueprints.

Zugangsdaten, Tokens und Passwörter dürfen nicht in Git gespeichert werden.
