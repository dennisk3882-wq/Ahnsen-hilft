# Eufy Smart Security

Eigenständige Android-App für den lokalen Eufy-P2P-Livestream. Zielgerät: Galaxy Tab S8+. Erster Test: T8210 an HomeBase 2.

Die APK enthält ihre Laufzeit selbst. Kein Termux, kein Render und kein externer eigener Streaming-Server. Die Anmeldung/Geräteermittlung läuft über Eufy; der Kamerastream wird mit lokalem P2P priorisiert.

## Smart Security v1.0

- bewährter lokaler Live-P2P-Stream
- Pinch-Zoom 1×–6×, Verschieben und Originalvergleich
- LIVE AI, AI ENHANCED, ULTRA und AUTO-Bildmodi
- Multi-Frame-Fusion, Deblock/Denoise/Deblur, ESPCN und Real-ESRGAN
- lokale EfficientDet-Objekterkennung für Person, Fahrzeuge, Tiere und weitere relevante Klassen
- Objekt-Tracking mit Track-ID, Aufenthaltsdauer und Prioritätswert
- lokale Loitering-Erkennung
- Smart Center mit Ereignis-Timeline, dynamischen Eufy-Geräteeinstellungen und lokalen Regeln
- Eufy-Events wie Bewegung, Klingeln, Person, Tier, Fahrzeug, Paket und Batteriewarnungen werden gesammelt, soweit das Gerät sie meldet
- automatischer Recovery-Pfad bei transientem Passport-Profile-Fehler

Nicht jede proprietäre Cloud-Funktion der offiziellen Eufy-App ist über den verwendeten Eufy-Client/API-Pfad verfügbar. Das Smart Center zeigt deshalb dynamisch nur Funktionen und Einstellungen an, die das konkrete Gerät tatsächlich freigibt.
