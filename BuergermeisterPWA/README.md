# Bürgermeister 1992+

Eine eigenständige PWA-Wirtschaftssimulation, inspiriert vom einfachen Monatsrhythmus klassischer C64-Bürgermeisterspiele. Keine Originalgrafiken, Texte oder Binärdateien werden verwendet.

## Spielen

Statischer Webserver genügt:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.

## Spielidee

- monatlich Land, Häuser, Hochhäuser, Schulen, Universitäten, Läden, Supermärkte und Nahrung kaufen/verkaufen
- Wohnsteuer festlegen und ihre direkte Wirkung auf Einnahmen, Zustimmung und Attraktivität abwägen
- Nahrung für Einwohner bereitstellen und Überschüsse über Supermärkte regional vermarkten
- Zuzug begrenzen und Wohnraum, Arbeitsplätze, Bildung und Versorgung im Gleichgewicht halten
- nachhaltiger Haushalt mit vollständiger Nahrungs-Wiederbeschaffung und Schuldzinsen
- dynamische Marktpreise mit Angebot, Nachfrage, Engpässen und Inflation
- gewichtete Ereignisse mit Voraussetzungen und Cooldowns
- acht zentrale Stadtstufen vom letzten Kuhdorf bis zur Metropole, jeweils mit eigener Stadtansicht
- vier alternative Spielziele, echte Niederlagen und eine kommunale Wiederwahl nach vier Amtsjahren
- automatische lokale Sicherungen sowie Spielstand-Export und -Import
- installierbar und offline als PWA

## Qualitätssicherung

Die Spiellogik liegt getrennt von der Benutzeroberfläche in `game-engine.js`. Der permanente GitHub-Actions-Testlauf prüft Syntax, mehrere Langzeitstrategien, Erreichbarkeit aller Siegbedingungen, Niederlagen und wirtschaftliche Invarianten. Zusätzlich läuft ein echter Chromium-End-to-End-Test, der unter anderem Monatsdialog, Steuerregler, Nahrungs-Regionalverkauf, Speichern/Wiederladen und die mobile Darstellung prüft. Generierte Testberichte werden ausschließlich als CI-Artefakt gespeichert und nicht in das Repository committed.

## Rechtlicher Ansatz

Das Projekt übernimmt nur die allgemeine Spielidee und den historischen Genre-Charakter. Es enthält keine Original-ROMs, Grafiken, Musik oder kopierten Texte des C64-Spiels.
