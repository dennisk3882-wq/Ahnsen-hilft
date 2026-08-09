# Bus & Mobilität – Stufe 2

Der Mobilitätsbereich trennt bewusst öffentliche Fahrplan-/Prognosedaten von echten Fahrzeugpositionen.

## Bereits integriert

- neue PWA-Seite `/mobilitaet`
- neue API `/api/mobilitaet`
- Startseiten-Kachel `Bus & Mobilität`
- Ahnsener Linien 2132, 2133 und 2026
- Ahnsener Haltestellenliste
- OpenStreetMap-/Leaflet-Karte
- Haltestellenkoordinaten aus öffentlichen OSM-Daten mit 6-Stunden-Cache
- lokale Favoriten für Linien und Haltestellen
- 20-Sekunden-Aktualisierung für echte Fahrzeugpositionen
- kein Erfinden oder Schätzen von Live-GPS-Daten
- Adapter für GTFS-Realtime VehiclePositions im JSON-Format
- Adapter für SIRI-VM/XML

## Aktivierung echter Stufe-2-Fahrzeugpositionen

Eine offizielle/freigegebene Schnittstelle wird über Render-Umgebungsvariablen hinterlegt:

- `MOBILITY_VEHICLE_POSITIONS_URL` – URL des freigegebenen Fahrzeugpositionsfeeds
- `MOBILITY_VEHICLE_PROVIDER` – Anzeigename des Datenanbieters
- `MOBILITY_VEHICLE_FORMAT` – `auto`, `gtfsrt-json`, `siri-vm` oder `xml`
- `MOBILITY_VEHICLE_BEARER_TOKEN` – optionaler Bearer-Token
- `MOBILITY_VEHICLE_API_KEY` – optionaler API-Key
- `MOBILITY_VEHICLE_API_KEY_HEADER` – Headername, Standard `X-API-Key`
- `MOBILITY_ROUTE_MAP_JSON` – optionales JSON-Mapping von internen RouteIds auf `2132`, `2133`, `2026`

Beispiel:

```text
MOBILITY_ROUTE_MAP_JSON={"32878_3":"2132"}
```

Ohne `MOBILITY_VEHICLE_POSITIONS_URL` bleibt die Seite vollständig benutzbar, kennzeichnet Stufe 2 aber ausdrücklich als noch nicht freigeschaltet. Es werden keine versteckten SHG-/IMS-Endpunkte gesucht oder gescraped.

## Datenquellen-Prinzip

VBN/Connect stellt GTFS-Solldaten sowie GTFS-Realtime-TripUpdates für Prognosen und Verspätungen bereit. TripUpdates werden nicht als GPS-Fahrzeugpositionen ausgegeben. Exakte Busmarker stammen ausschließlich aus einer konfigurierten freigegebenen Fahrzeugpositionsschnittstelle.
