# Technische und organisatorische Maßnahmen (TOM)

## Zutritt und Zugriff

- Render-Konto und GitHub-Konto nur für benannte Verantwortliche
- persönliche Verwaltungskonten und eine zentrale Rollen-/Rechtematrix; Navigation und Serverprüfung verwenden dieselbe Quelle
- verpflichtende Zwei-Faktor-Authentisierung für Vollzugriff, Gemeindeverwaltung und Bürgermeister; Einrichtung nur im eigenen Konto
- keine gemeinsamen Passwörter; Wiederherstellungscodes geschützt verwahren
- widerrufbare, HttpOnly-, Secure- und SameSite-Sitzungen

## Übertragung und Eingabe

- TLS/HTTPS, Herkunftsprüfung, Security Header und eingeschränkte Browserberechtigungen
- Rate-Limits für Anmeldung, Meldungen und Barriere-Feedback
- Dateityp- und Größenprüfung; keine Veröffentlichung ungeprüfter Fotos
- Audit-Log mit Filter/CSV-Export und verketteter HMAC-Integritätsprüfung für administrative und sicherheitsrelevante Vorgänge

## Verfügbarkeit

- tägliche verschlüsselte Gesamtsicherung bei konfiguriertem dauerhaftem Speicher, Aufbewahrungsfrist, Prüfsumme und Validierungsfunktion
- dokumentierte Wiederherstellung in einer getrennten Zielumgebung
- Health-/Deep-Health-Prüfung, Diagnosecenter und Systemereignisse
- Warn-, Wetter- und externe Dienste müssen bei Ausfall eine verständliche Ersatzanzeige liefern

## Trennung und Minimierung

- Bürger- und Verwaltungszugänge getrennt
- Standort und Foto freiwillig; öffentliche Koordinaten gerundet
- Formulareingaben nicht an den Übersetzungsdienst senden
- keine Werbung und kein Reichweitentracking

## Organisation

- Berechtigungen mindestens halbjährlich prüfen
- Inhaltsänderungen über Versionsvergleich und – sobald ein zweites berechtigtes Konto vorhanden ist – Vier-Augen-Freigabe veröffentlichen
- frühere freigegebene Inhaltsstände nur als neue, erneut zu prüfende Wiederherstellungsversion einspielen
- Sicherheitsupdates zeitnah einspielen
- Dienstleister- und Datenflussinventar nach Änderungen aktualisieren
- Vorfälle nach dem Vorfallplan behandeln und dokumentieren
