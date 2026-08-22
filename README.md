# Eufy Local Monitor

Eigenständige Android-App für den lokalen Eufy-P2P-Livestream. Zielgerät: Galaxy Tab S8+. Erster Test: T8210 an HomeBase 2.

Die APK enthält ihre Laufzeit selbst. Kein Termux, kein Render und kein externer eigener Streaming-Server. Die Anmeldung/Geräteermittlung läuft über Eufy; der Kamerastream wird mit `ONLY_LOCAL` auf lokales P2P festgelegt.

## Live-Ansicht v0.2

- Pinch-Zoom von 1× bis 6×
- Ausschnitt bei Zoom mit einem Finger verschieben
- Doppeltipp: 2× bzw. zurück auf 1×
- Zoom-Anzeige oben rechts; Antippen setzt auf 1× zurück
