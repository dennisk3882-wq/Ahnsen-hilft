# QuizTime 13 – Produktionskonfiguration

## Render-Umgebungsvariablen

`LEGAL_CONTACT_EMAIL`  
Öffentlich erreichbare Kontakt-E-Mail für Impressum, Datenschutz und Support. Ohne diese Variable meldet `/api/platform/release-readiness` den Status `fail`.

`SUPPORT_EMAIL`  
Optionale getrennte Supportadresse. Wird als Ersatz verwendet, wenn `LEGAL_CONTACT_EMAIL` nicht gesetzt ist.

`BACKUP_AUTOMATION_CONFIGURED=true`  
Erst setzen, nachdem die tägliche verschlüsselte Sicherung tatsächlich aktiviert und mindestens einmal erfolgreich wiederhergestellt wurde.

`DATABASE_BACKUP_CONFIRMED_AT`  
Optionaler ISO-Zeitstempel der letzten extern bestätigten Sicherungsprüfung.

Die bestehenden Variablen für PostgreSQL, Sitzungsgeheimnisse, Plattform-Admin und E-Mail-Versand bleiben erforderlich.

## GitHub-Actions-Secrets für das verschlüsselte Backup

`QUIZTIME_DATABASE_URL`  
Datenbankverbindung mit Leserechten für den vollständigen Dump.

`QUIZTIME_BACKUP_PASSPHRASE`  
Lange, eigenständige Passphrase zur AES-256-Verschlüsselung. Nicht mit Admin-, Profil- oder Plattformpasswörtern wiederverwenden.

GitHub Actions speichert ausschließlich die verschlüsselte `.dump.enc`-Datei und ihre SHA-256-Prüfsumme. Der unverschlüsselte Dump wird nach der Wiederherstellungsprobe gelöscht.
