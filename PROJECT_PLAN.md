# Ahnsen hilft – Projektplan

## 1. Projektziel

„Ahnsen hilft“ ist ein digitaler Dorfassistent für WhatsApp und ein geschütztes
Verwaltungs-Dashboard. Bürgerinnen und Bürger sollen Informationen schnell
abrufen und Anliegen ohne zusätzliche App melden können. Die zuständigen
Personen verwalten Inhalte und Vorgänge über eine einfache, auch mobil gut
nutzbare Oberfläche.

## 2. Aktueller Stand

### Bereits vorhanden

- WhatsApp-Webhook über die Meta WhatsApp Business Platform
- Geführtes WhatsApp-Hauptmenü
- Mängelmeldung mit Art, Ort, Beschreibung und optionalem Foto
- Speicherung von Mängelmeldungen in PostgreSQL
- E-Mail-Benachrichtigung bei neuen Mängelmeldungen
- Geschütztes Verwaltungs-Dashboard mit Suche, Filtern, Status und Notizen
- Veranstaltungsverwaltung mit optionalem Bild
- Ausgabe aktiver Veranstaltungen über WhatsApp
- DGH-Terminverwaltung mit Kalenderübersicht
- DGH-Buchungsanfragen über WhatsApp
- Bereitstellung über Render

### Noch nicht umgesetzt

- Inhalte für Vereine, Feuerwehr, Ansprechpartner, Aktuelles und Mülltermine
- Freie Fragen in natürlicher Sprache
- Dauerhafte Speicherung laufender WhatsApp-Unterhaltungen
- Rollen und mehrere Verwaltungsbenutzer
- Kartenansicht für Mängel
- Exporte und Auswertungen
- Automatische Erinnerungen und Statusnachrichten
- Vollständige Tests

## 3. Verbindliche Fachregeln

### Mängelmeldungen

1. Eine Meldung erhält eine eindeutige Vorgangsnummer.
2. Die Meldung wird zuerst in der Datenbank gespeichert.
3. Ein Fehler bei der E-Mail-Benachrichtigung darf die gespeicherte Meldung
   nicht löschen und keine erneute Meldung provozieren.
4. Fotos sind optional.
5. Interne Notizen sind für Bürger nicht sichtbar.

### Veranstaltungen

1. Im WhatsApp-Menü erscheinen nur aktive, nicht vergangene Veranstaltungen.
2. Fehlerhafte oder fehlende Datumsangaben dürfen das Menü nicht zum Absturz
   bringen.
3. Bilder sind optional und sollen auch beim Bearbeiten austauschbar sein.

### DGH

1. Eine WhatsApp-Buchung ist zunächst eine **Anfrage**, keine bestätigte
   Belegung.
2. Nur Termine mit dem Status **Bestätigt** sperren einen Tag.
3. Eine Anfrage muss im Dashboard bestätigt oder abgelehnt werden können.
4. Deaktivierte oder abgelehnte Termine sperren keinen Tag.
5. Die endgültige Zusage erfolgt durch die zuständige Person.
6. Bei Bestätigung oder Ablehnung erhält der WhatsApp-Absender automatisch
   eine passende Statusnachricht.

## 4. Technik

- Python mit FastAPI
- SQLAlchemy
- PostgreSQL auf Render
- Meta WhatsApp Business Platform
- Gmail-SMTP für Benachrichtigungen
- Serverseitig erzeugtes HTML für das Verwaltungs-Dashboard

Benötigte Umgebungsvariablen:

- `DATABASE_URL`
- `VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_TO`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET` (optional; fällt sonst auf das Dashboard-Passwort zurück)

`EMAIL_PASSWORD` muss bei Gmail ein App-Passwort sein. Zugangsdaten dürfen
weder im Quellcode noch im Git-Repository gespeichert werden.

## 5. Designregeln

- Einheitliche Navigation in allen Verwaltungsbereichen
- Gut lesbar auf Smartphone, Tablet und Desktop
- Große, eindeutig beschriftete Schaltflächen
- Einheitliche Farben:
  - Rot: offen, belegt oder kritisch
  - Gelb: Anfrage oder in Bearbeitung
  - Grün: bestätigt, erledigt oder frei
  - Grau: inaktiv oder abgelehnt
- Sicherheitsrelevante Aktionen brauchen eine klare Bestätigung.
- Technische Fehlermeldungen werden nicht direkt Bürgern angezeigt.

## 6. Priorisierte Weiterentwicklung

### Phase 1 – Stabilität und Sicherheit

- [x] Mängel- und E-Mail-Ablauf entkoppeln
- [x] DGH-Anfragestatus korrigieren
- [x] Sichere Dashboard-Zugangsdaten erzwingen
- [x] Fehlerhafte Veranstaltungsdaten sicher sortieren
- [x] Protokolle von unnötigen personenbezogenen Daten bereinigen
- [ ] Weitere Eingaben und Datumsangaben validieren
- [ ] Automatisierte Kernablauftests dauerhaft ergänzen

### Phase 2 – Einheitliches Dashboard

- Gemeinsames Layout und gemeinsame Navigation
- Mobile Kartendarstellung statt breiter Tabellen
- Direkte und verständliche Statusauswahl
- Löschbestätigungen
- Übersichtsseite für alle Module

### Phase 3 – Inhalte

- Ansprechpartner
- Vereine
- Feuerwehr
- Aktuelles
- [x] Müllabfuhr Termine mit PDF-Jahresimport und WhatsApp-Anzeige

### Phase 4 – Erweiterungen

- Dauerhafte Gesprächszustände
- Kartenansicht
- Export als CSV/PDF
- Statistiken
- Benutzer- und Rollenverwaltung
- Automatische WhatsApp-Statusmeldungen
- Optionale KI-gestützte freie Fragen

## 7. Offene Betriebsaufgaben

- Für Gmail Zwei-Faktor-Anmeldung aktivieren und ein App-Passwort als
  `EMAIL_PASSWORD` auf Render hinterlegen.
- Prüfen, ob alle Dashboard-Zugangsdaten auf Render gesetzt sind.
- Git-Repository lokal vollständig anbinden; der aktuelle Ordner enthält
  keinen `.git`-Verlauf.
- Datenschutz, Aufbewahrungsfristen und verantwortliche Empfänger vor dem
  öffentlichen Betrieb festlegen.

## 8. Arbeitsweise

Dieser Plan ist die dauerhafte gemeinsame Referenz. Nach jeder größeren
Funktion werden der Abschnitt „Aktueller Stand“ und die Prioritäten
aktualisiert. Neue Funktionen gelten erst als fertig, wenn Fehlerfälle und die
mobile Darstellung geprüft wurden.

## 9. Änderungsstand vom 05.07.2026

- E-Mail-Ausfälle verursachen keinen Verlust und keine erneute Erfassung einer
  bereits gespeicherten Mängelmeldung mehr.
- Vorgangsnummern besitzen einen zusätzlichen zufälligen Anteil und können
  deshalb auch bei gleichzeitigen Meldungen nicht leicht kollidieren.
- WhatsApp-DGH-Buchungen werden als Anfrage gespeichert.
- DGH-Anfragen können im Dashboard bestätigt, abgelehnt oder als belegt
  markiert werden.
- DGH-Kalender unterscheiden freie, angefragte und belegte Tage.
- Der DGH-Kalender zeigt das laufende und das vollständige kommende Jahr.
- Tage mit Anfrage oder bestätigtem Termin öffnen eine Detailansicht mit
  Buchungsdaten und Bearbeitungslink.
- Veranstaltungsbilder können beim Bearbeiten ersetzt werden.
- Fehlerhafte Veranstaltungsdaten bringen das WhatsApp-Menü nicht mehr zum
  Absturz.
- Unsichere Standardzugangsdaten für das Dashboard wurden entfernt.
- Die Navigation enthält in allen drei Verwaltungsbereichen das DGH-Modul.
- Die Startseite besitzt eine eigene Anmeldung und führt nach erfolgreichem
  Login über Kacheln zu Mängeln, Veranstaltungen und DGH.
- Die Verwaltungsstartseite zeigt Kennzahlen, Erinnerungen, letzte Vorgänge
  und eine bereichsübergreifende Suche.
- Das WhatsApp-Hauptmenü besitzt passende Symbole für alle Bereiche; das
  Dorfgemeinschaftshaus wird mit einem Gebäude-Symbol dargestellt.
- In allen WhatsApp-Untermenüs und laufenden Eingabeabläufen führt die Auswahl
  `0` zuverlässig zurück ins Hauptmenü.
- Der AWS-Jahreskalender für Ahnsen kann im Dashboard als PDF hochgeladen
  werden. Datum, Wochentag, Abfuhrarten und Feiertagsverschiebungen werden
  automatisch erkannt.
- WhatsApp zeigt die nächsten Müllabfuhrtermine mit Tonnenart und verbleibenden
  Tagen bis zur Abholung an.
- WhatsApp zeigt kompakt die nächsten zwei Müllabfuhrtermine. Bewohner können
  eine Erinnerung abonnieren und wieder kündigen.
- Ein eigener Render-Zeitauftrag versendet am Vortag um 18:00 Uhr eine
  WhatsApp-Vorlagennachricht mit den Abfuhrarten für den nächsten Tag.
