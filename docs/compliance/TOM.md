# Technische und organisatorische Maßnahmen (TOM)

## Zutritt und Zugriff

- Render-Konto und GitHub-Konto nur für benannte Verantwortliche
- persönliche Verwaltungskonten, Rollenmodell und Zwei-Faktor-Authentisierung
- keine gemeinsamen Passwörter; Wiederherstellungscodes geschützt verwahren
- widerrufbare, HttpOnly-, Secure- und SameSite-Sitzungen

## Übertragung und Eingabe

- TLS/HTTPS, Herkunftsprüfung, Security Header und eingeschränkte Browserberechtigungen
- Rate-Limits für Anmeldung, Meldungen und Barriere-Feedback
- Dateityp- und Größenprüfung; keine Veröffentlichung ungeprüfter Fotos
- Audit-Log für administrative und sicherheitsrelevante Vorgänge

## Verfügbarkeit

- Datenbank- und Gesamtsicherung, Prüfsumme und Validierungsfunktion
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
- Sicherheitsupdates zeitnah einspielen
- Dienstleister- und Datenflussinventar nach Änderungen aktualisieren
- Vorfälle nach dem Vorfallplan behandeln und dokumentieren
