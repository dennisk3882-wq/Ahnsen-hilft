# Datenflüsse und Dienstleister

| Bereich | Daten | Ziel / Dienst | Auslöser |
|---|---|---|---|
| Webbetrieb | IP, Zeitpunkt, Browserdaten | Render Web Service | Seitenaufruf |
| Datenbank | Bürgerkonten, Vorgänge, Einstellungen | Render PostgreSQL Frankfurt | jeweilige Funktion |
| Mängelmelder | Text, Ort, optional Foto/GPS/Kontakt | Datenbank und Verwaltungspostfach | Absenden |
| DGH | Termin, Anlass, Kontakt, Nachricht | Datenbank und Verwaltungspostfach | Absenden |
| Push | Endpunkt, Schlüssel, Themen | Browser-Push-Anbieter | freiwilliges Abonnement |
| Karten | Ausschnitt, ggf. freigegebener Standort | OpenFreeMap/OSM; Nominatim | Karte/Standort aktiv genutzt |
| Mobilität | Haltestelle, Verbindung, Kartenausschnitt | DB Transport, EFA, Transitous, Overpass, OSM | Mobilitätsfunktion |
| Wetter/Warnung | Ort/Gebiet Ahnsen | Open-Meteo, DWD, BBK | Startseite/Serverabruf |
| Übersetzung | sichtbare Seitentexte | konfigurierter LibreTranslate-Dienst | aktive Fremdsprachauswahl |
| E-Mail | Vorgangs- und Kontaktdaten | konfigurierter SMTP-Dienst | Meldung/Anfrage/Feedback |

Formulareingaben werden nicht automatisch übersetzt. Öffentliche GPS-Koordinaten von Mängeln werden gerundet. Kartendaten und externe Verkehrsdaten sind getrennt als Fremdquellen zu kennzeichnen.

Vor der Freigabe sind je Anbieter Zweck, Rechtsgrundlage, Vertragsrolle, Region, Speicherfrist, Unterauftragnehmer und Drittlandbezug zu bestätigen.
