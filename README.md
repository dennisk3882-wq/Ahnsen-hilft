# Ahnsen hilft

„Ahnsen hilft“ ist eine installierbare Progressive Web App für Ahnsen. Sie
bündelt Bürgerdienste, Dorfveranstaltungen und persönliche Vorgänge in einer
modernen, für Smartphones optimierten Oberfläche.

## Funktionsumfang

- installierbare PWA mit Manifest, App-Symbolen und Service Worker
- moderner Startbildschirm im Ahnsen-Dorfdesign
- direkter Mängelmelder mit Foto und optionalem Gerätestandort
- öffentliche Statusabfrage per zufälliger Vorgangsnummer
- freiwillige Bürgerkonten mit sicher gehashten Passwörtern
- persönliches Profil mit eigenen Mängelmeldungen und DGH-Anfragen
- vollständige digitale DGH-Mietanfrage mit Zu- oder Absage im Dashboard
- Browser-Push bei Statusänderungen von Meldungen und DGH-Anfragen
- optionale Müllabfuhr-Erinnerung am Vortag um 18 Uhr
- Veranstaltungen, Vereine, Aktuelles, Feuerwehr und Ansprechpartner
- geschützter Verwaltungsbereich unter `/verwaltung`

Der frühere WhatsApp-Bot, Webhook, Chatverlauf und WhatsApp-Erinnerungsjob sind
aus der Anwendung entfernt. Alte Datenbankspalten bleiben ausschließlich für
eine verlustfreie Migration vorhandener Datensätze erhalten; neue Kommunikation
läuft über Bürgerkonto, E-Mail und Browser-Push.

Das eigenständige **Ahnser Quiz** ist kein Bestandteil dieses Repositorys. Es
bleibt als separates Projekt unter https://ahnsen-live-quiz.onrender.com/
erreichbar und besitzt einen eigenen Build-, Test- und Deployment-Lebenszyklus.

## Lokaler Start

1. Python 3.11 installieren.
2. Abhängigkeiten installieren: `pip install -r requirements.txt`
3. Variablen aus `.env.example` setzen.
4. Anwendung starten:

```bash
uvicorn pwa_main:app --host 0.0.0.0 --port 10000
```

Die Bürger-PWA ist unter `/`, das Profil unter `/profil` und der
Verwaltungszugang unter `/verwaltung` erreichbar.

## Erforderliche Geheimwerte

Für Kontositzungen muss `PWA_SESSION_SECRET` als langer zufälliger Wert gesetzt
sein. Render erzeugt diesen Wert beim Blueprint-Deployment automatisch.

Für Browser-Push werden ein VAPID-Schlüsselpaar und eine Kontaktangabe benötigt:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`, beispielsweise `mailto:gemeinde@ahnsen.de`

Der private Schlüssel darf niemals ins Repository eingecheckt werden. Ohne
VAPID-Schlüssel funktionieren die übrigen PWA-Funktionen weiterhin; im Profil
wird Push dann als noch nicht serverseitig eingerichtet angezeigt.

## Architektur

- `pwa_main.py` ist der einzige Produktionseinstieg.
- `pwa_core.py` enthält die etablierten Kernrouten.
- `feature_routes.py` registriert noch nicht vollständig konsolidierte
  Fachrouter einmalig und ausdrücklich beim Import der Produktions-App.
- Datenbank-Initialisierer registrieren keine HTTP-Routen mehr.
- `main.py` enthält vorübergehend noch wiederverwendete Verwaltungsrouten; der
  WhatsApp-Laufzeitpfad wurde daraus entfernt.
- Das freigegebene Stein-Fotoicon liegt ausschließlich als v7-PNG in
  180, 192 und 512 Pixeln vor. Alte Icon-URLs liefern aus Kompatibilitätsgründen
  dasselbe v7-Icon aus, besitzen aber keine eigenen Altdateien mehr.

Weitere Details und offene Konsolidierungsschritte stehen in
[`PROJECT_PLAN.md`](PROJECT_PLAN.md).

## Push-Erinnerungsjob

Der Render-Cronjob `ahnsen-pwa-erinnerungen` prüft stündlich die Berliner
Ortszeit. Nur um 18 Uhr werden bei vorhandenen Abfuhrterminen Erinnerungen für
den Folgetag versendet. Pro Konto und Abfuhrtermin verhindert ein
Datenbankeintrag Doppelversand.

## Datenschutz und Sicherheit

- Konten sind freiwillig; der Mängelmelder bleibt ohne Konto nutzbar.
- Passwörter werden mit `scrypt` und individuellem Salt gespeichert.
- Sitzungen sind signiert, zeitlich begrenzt, HttpOnly und SameSite=Lax.
- Push-Abonnements entstehen nur nach Browserfreigabe und können pro Gerät
  wieder entfernt werden.
- Standortdaten werden ausschließlich nach ausdrücklicher Freigabe übernommen.
- E-Mail-Ausfälle löschen keine bereits gespeicherten Meldungen oder Anfragen.
- Zugangsdaten und Schlüssel gehören ausschließlich in Server-Umgebungsvariablen.
