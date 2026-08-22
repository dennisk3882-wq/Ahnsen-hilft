# Eufy Local Monitor

Eigenständige Android-App für den lokalen Eufy-P2P-Livestream. Zielgerät: Galaxy Tab S8+. Erster Test: T8210 an HomeBase 2.

Die APK enthält ihre Laufzeit selbst. Kein Termux, kein Render und kein externer eigener Streaming-Server. Die Anmeldung/Geräteermittlung läuft über Eufy; der Kamerastream wird mit `ONLY_LOCAL` auf lokales P2P festgelegt.

## Live-Ansicht v0.3

- Pinch-Zoom von 1× bis 6×
- Ausschnitt bei Zoom mit einem Finger verschieben
- Doppeltipp: 2× bzw. zurück auf 1×
- Zoom-Anzeige oben rechts; Antippen setzt auf 1× zurück
- `Enhance: Echtzeit`: lokales temporales Denoising + adaptive Schärfung während des Livebilds
- `Enhance: AI Detail 4K`: sammelt drei Frames, mittelt Rauschen, nimmt den aktuell sichtbaren Zoom-Ausschnitt und verarbeitet ihn mit einem lokal gebündelten ESPCN-Super-Resolution-Modell
- AI-Detail wird anschließend bis maximal 3840×2160 bzw. bei 4:3 bis 2880×2160 ausgegeben
- Keine Kamerabilder werden für die Bildverbesserung hochgeladen

Hinweis: Die 4K-Ausgabe ist eine Super-Resolution-/Upscaling-Ausgabe und keine native 4K-Aufnahme der T8210.
