# Backup, Wiederherstellung und Sicherheitsvorfälle

## Backup-Test

1. `BACKUP_DIRECTORY` auf ein dauerhaft eingebundenes, nur für den Dienst zugängliches Verzeichnis setzen.
2. `BACKUP_ENCRYPTION_KEY` mit mindestens 12 Zeichen getrennt vom Sicherungsort hinterlegen.
3. Im Verwaltungsbereich unter **Sicherung** den automatischen Testlauf starten. Der Hintergrunddienst legt danach täglich höchstens eine verschlüsselte `.ahnsenbak`-Datei an und entfernt Dateien nach `BACKUP_RETENTION_DAYS` (Standard: 30 Tage).
4. Zusätzlich eine verschlüsselte Gesamtsicherung herunterladen und getrennt aufbewahren.
5. Jede Sicherung mit der eingebauten Validierung prüfen; sie kontrolliert Format, Prüfsumme und Datensatzanzahl, ohne Produktivdaten zu verändern.
6. Mindestens vierteljährlich in einer getrennten Testdatenbank wiederherstellen.
7. Stichproben: Kontenanzahl, offene Mängel, Termine, Einstellungen und Dokumente.
8. Ergebnis, Dauer, Abweichungen und ausführende Person protokollieren.

Das Restore-Skript `scripts/restore_backup.py` validiert standardmäßig nur. Erst `--confirm RESTORE-AHNSEN` erlaubt den transaktionalen Austausch der Daten. Eine Wiederherstellung in Produktion erfolgt niemals zum Test und nur nach dokumentierter Freigabe. Vorher ist ein aktueller Sicherungsstand zu erzeugen.

## Vorfallplan

1. Vorfall aufnehmen: Zeitpunkt, Melder, Systeme, erste Beobachtung.
2. Eindämmen: Zugang sperren, Sitzung widerrufen, Schlüssel wechseln oder betroffene Funktion deaktivieren.
3. Beweise sichern: Logs und Zeitlinie geschützt kopieren; keine unnötigen personenbezogenen Daten verteilen.
4. Risiko bewerten: Datenarten, Umfang, Personen, mögliche Folgen und Schutzmaßnahmen.
5. Datenschutzbeauftragten und Verantwortlichen unverzüglich einbeziehen.
6. Melde- und Benachrichtigungspflichten samt Fristen prüfen.
7. Beheben, Funktion prüfen, Betroffene transparent informieren, falls erforderlich.
8. Ursache und Verbesserungen dokumentieren; Maßnahmen nachverfolgen.
