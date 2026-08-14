# Ahnsen hilft - aktueller Projektplan

Stand: 14. August 2026

## Ziel

„Ahnsen hilft“ ist eine installierbare, mobile Bürgerplattform für Ahnsen. Sie
verbindet alltägliche Bürgerdienste, lokale Informationen, Beteiligung und
Verwaltungsvorgänge. Die technische Basis soll später als getrennt
konfigurierbare White-Label-Lösung für weitere Kommunen nutzbar sein.

## Produktionsstand

- Produktionseinstieg: `uvicorn pwa_main:app`
- Datenbank: PostgreSQL über `DATABASE_URL`
- Hosting: Render Web Service plus Erinnerungs-Cronjob
- aktuelles Launcher-Icon: freigegebenes Ahnsen-Stein-Foto, Version v7
- Kommunikation: Browser-Push und E-Mail
- WhatsApp-Bot: vollständig außer Betrieb und aus dem Laufzeitpfad entfernt
- Ahnser Quiz: eigenständiges Projekt, nicht Bestandteil dieses Repositorys

## Vorhandene Fachbereiche

- Bürgerkonto, Profil und Nachrichtenzentrale
- Mängelmelder mit Foto, Standort, Status, Karte und Duplikaterkennung
- DGH-Kalender und Mietanfragen
- Veranstaltungen, Aktuelles, Rückblicke und Kalenderexport
- Mülltermine, Kalenderexport und persönliche Erinnerungen
- amtliche Warnungen sowie Wetter
- Mobilität, Linien, Haltestellen und Verbindungen
- Bürgerservice mit offiziellen Formular- und Behördenlinks
- Ratsinformationen und Ratsarchiv
- Ideenportal und Nachbarschaftshilfe
- Suche, Übersetzung und White-Label-Konfiguration
- Verwaltungscockpit, Audit, Statistiken und Systemdiagnose

## Verbindliche Produktregeln

1. Hauptfunktionen bleiben als Kacheln auf der Startseite erreichbar.
2. Das Bürgerkonto bleibt zentral, ist für öffentliche Grundfunktionen aber
   nicht verpflichtend.
3. Personenbezogene Daten erscheinen niemals auf öffentlichen Karten.
4. Warnungen stammen ausschließlich aus amtlichen Quellen.
5. Externe Quellen benötigen sichere Timeouts, Cache und verständliche
   Fallbacks.
6. Ahnsens Ortsgeschichte darf bei White-Label-Installationen nicht auf andere
   Gemeinden übertragen werden.
7. Das Ahnser Quiz bleibt technisch und betrieblich von „Ahnsen hilft“ getrennt.

## Architektur und Bereinigung

### Erledigt

- WhatsApp-Webhook, Bot, Chatverwaltung und Erinnerungsjob entfernt
- Quiz-Produktionsprüfung aus diesem Repository entkoppelt
- Stein-Fotoicon als einzige physische Icongeneration festgelegt
- alte Icon-URLs auf das aktuelle v7-Icon umgeleitet
- versteckte Router-Installation aus dem Müll-Datenbankstart entfernt
- zentrale Feature-Registrierung über `feature_routes.py` eingeführt
- überholte Projektbeschreibung ersetzt

### Noch schrittweise zu konsolidieren

Einige historisch gewachsene Module tragen weiterhin Namen wie `*_patch.py`
oder `*_polish.py`. Sie enthalten aktive Produktionslogik und dürfen nicht
pauschal gelöscht werden. Sie werden Fachbereich für Fachbereich in folgende
kanonische Module überführt:

1. Veranstaltungen und Aktuelles
2. Mobilität
3. Nachbarschaft
4. Startseite
5. Mängel-Duplikatworkflow

Nach jeder Überführung müssen die bisherigen Smoke-Tests auf die kanonische
Implementierung umgestellt werden. Erst dann wird das jeweilige Altmodul
entfernt.

## Nächste technische Prioritäten

1. CSRF-Schutz und ausschließlich schreibende HTTP-Methoden für Änderungen
2. echte Datenbankmigrationen und getestete Wiederherstellung
3. dauerhafter Objektspeicher für Uploads
4. mehrere Verwaltungsbenutzer mit Rollen und persönlichem Audit
5. vollständiger Kontolebenszyklus einschließlich Passwort-Reset und Löschung
6. Browser-End-to-End-Tests für Installation, Push und zentrale Vorgänge
7. BITV-/WCAG-AA-Prüfung

## Qualitätsregel

Keine aktive Funktion wird allein wegen eines alten Dateinamens entfernt.
Bereinigung gilt erst als abgeschlossen, wenn die Ersatzimplementierung
vorhanden ist und die zugehörigen automatischen Prüfungen erfolgreich laufen.
