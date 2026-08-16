# Bürgermeister 2026

Mobile-first PWA einer eigenständigen deutschen Kommunal-Aufbau- und Verwaltungssimulation.

## Enthalten
- interaktive 18×14 Stadtkarte
- Bau-/Abrissmodus mit Straßenabhängigkeit
- 11 Gebäudetypen mit Bau- und Folgekosten
- kommunaler Monatshaushalt
- Bevölkerung, Wohnraum, Arbeitsplätze, Arbeitslosigkeit
- Bildung, Sicherheit und Gesundheit als Versorgungswerte
- Zufriedenheit, Zustimmung, Umwelt und Infrastruktur
- zufällige politische Ereignisse mit echten Konsequenzen
- Kommunalwahl alle 48 Spielmonate
- Ziele/Erfolge
- Auto-Save via LocalStorage
- Offline-PWA via Service Worker
- responsive Touch-Oberfläche
- FastAPI-Wrapper für Render

## Lokal starten
```bash
pip install -r requirements.txt
uvicorn app:app --reload
```
Dann http://127.0.0.1:8000 öffnen.

## Render
Die `render.yaml` ist für einen separaten Render-Webservice vorbereitet. Im bestehenden Ahnsen-Repository wird dieses Projekt nur in einem eigenen Branch/Unterordner abgelegt, damit die Produktions-PWA nicht verändert wird.
