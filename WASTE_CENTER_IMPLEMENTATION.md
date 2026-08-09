# Abfall-Zentrale

Die PWA stellt den Müllbereich als kompakte Abfall-Zentrale dar. Die bestehende ICS-Kalenderfunktion bleibt erhalten. Angemeldete Nutzer können Müll-Push-Erinnerungen direkt auf der Seite aktivieren und zwischen Vorabend 18:00 Uhr, Vorabend 20:00 Uhr und Abholtag 06:30 Uhr wählen.

Die Erinnerungszeit wird getrennt von den übrigen Push-Kategorien gespeichert. Beim Deaktivieren der Müll-Erinnerung wird die Browser-Push-Subscription nicht gelöscht, damit Meldungs-, DGH- oder Warn-Push weiterhin funktionieren.

Der Render-Cron bleibt beim bestehenden Skriptnamen `pwa_push_job.py`; dieses delegiert an die erweiterte Logik. Der Blueprint stellt den Cron auf einen 30-Minuten-Takt, damit die 06:30-Uhr-Option exakt erreicht wird. Die bisherige Warnquellen- und Digest-Prüfung bleibt auf einen Lauf pro Stunde begrenzt.
