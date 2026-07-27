# Ahnsen Live-Quiz v6.2 – professionelles Design

## Quizmaster

- Eigenständige Live-Quiz-Ansicht nach dem Vorbereiten eines Quiz
- Dunkles, violettes Game-Show-Design mit klarer Seitenleiste
- Große Fragenkarte, vier visuell getrennte Antworten und animierter Countdown-Ring
- Übersichtlich gruppierte Quizsteuerung, Notfallfunktionen, Pausensteuerung und Zwischenrangliste
- Teilnehmer-Rangliste mit Punkten, Antworten, Verbindungsstatus und Latenz
- Animierte Antwortverteilung als Ringdiagramm

## Teilnehmer

- Einheitliches responsives Design für Smartphones
- Große Antwortflächen mit A–D-Kennzeichnung
- Deutlicher Countdown, Antwortbestätigung, Pause, Zwischenrangliste und Ergebnisansicht
- Akustische Signale in den letzten fünf Sekunden

## Beamer

- Professionelle Vollbilddarstellung mit großer Frage, Antworten und Countdown
- Antwortverteilung nach der Auflösung
- Animierte Zwischenrangliste und Siegerpodest
- QR-Code und Verbindungsstatus im Warteraum

## Optionale Fragebilder

Fragen unterstützen technisch ein optionales Feld `imageUrl`. Der Frageneditor enthält dafür ein freiwilliges Bildlink-Feld. Alle vorhandenen Erwachsenen- und Kinderfragen bleiben zunächst ohne Bild. Teilnehmer- und Beameransicht reservieren nur dann Bildfläche, wenn tatsächlich eine Bildadresse hinterlegt ist.

## Qualitätssicherung

Der Render-Build prüft das v6.2-Paket per SHA-256 und XZ-Integrität. Anschließend laufen die vorhandenen Syntax-, Punkte- und Katalogtests. Lokal wurden `npm run check` und `npm run test:core` erfolgreich ausgeführt.
