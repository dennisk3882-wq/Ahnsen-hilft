# Umsetzung der Projektanalyse · September 2026

## Verhalten nach diesem Update

| Analysepunkt | Umsetzung |
|---|---|
| Privater Offline-Cache | Nur eine feste Liste geprüfter CSS-, JS- und Icon-Dateien wird zwischengespeichert. HTML, Vorgänge, Token-Links und private Chats erhalten `private, no-store`. Die neue Worker-Version entfernt alte Caches. Offline können persönliche Seiten nicht erneut geöffnet werden. |
| Private Texte in Übersetzungsdiensten | Der Server signiert einzelne freigegebene öffentliche Texte. Der Übersetzungsendpunkt weist andere oder abgelaufene Texte ab. Die lokale Oberfläche bleibt in fünf Sprachen verfügbar. Unbekannte private Texte bleiben im Original. Alte Browser-Übersetzungscaches werden verworfen. MyMemory ist standardmäßig deaktiviert. |
| Öffentliche Mängelkarte | Bestehende und neue Meldungen sind zunächst verborgen. Eine Verwaltungsaktion gibt Kategorie, Status und gerundete Koordinaten frei. Freitext-Ortsangaben, Kontaktdaten, Beschreibungen und Fotos werden nicht auf der Karte veröffentlicht. |
| Sicherung und Restore | PostgreSQL-Sicherung mit konsistentem Repeatable-Read-Snapshot; typed SQLite-Export. Vor dem Restore werden vollständige Tabellen- und Spaltenmengen geprüft. Kein unkontrolliertes CASCADE. Fremdschlüsselreihenfolge, Rollback und anschließende Vergabe neuer IDs werden mit PostgreSQL getestet. Alte SQLite-Zeitstempel werden unterstützt. |
| Externe Kopie | Optionaler verschlüsselter WebDAV-Upload mit anschließendem Rücklesen und SHA-256-Vergleich, Wiederholungsversuch und Aufbewahrungsfrist. Ohne Zugangsdaten wird kein externer Dienst angesprochen. |
| DGH-Konflikte | Alle konkurrierenden Änderungen an Buchungen teilen sich eine Transaktionssperre. Auch Reaktivierung und beide Datumsformate werden geprüft. |
| Inhaltsfreigaben | Gemeindeseite, Plattform, unveränderliche Bilddateien, Import und vollständige Veranstaltungsdaten verwenden einen gemeinsamen Veröffentlichungsdienst. Version und veröffentlichte Änderung sind eine Transaktion. Fremdfreigaben prüfen die Bereichsberechtigung. Veraltete Entwürfe dürfen neuere Veröffentlichungen nicht überschreiben. |
| Audit | Schreibvorgänge werden datenbankweit serialisiert. Der gesamte Verlauf wird geprüft, einschließlich eines getrennten Kopfdatensatzes zur Erkennung abgeschnittener Enden. Kein fest eingebauter Entwicklungsschlüssel. |
| Kontodaten | Export umfasst Einstellungen, private Nachrichten und Chats, eigene Beiträge, Erinnerungen und Geräteinformationen ohne kryptografische Geheimnisse. Löschung widerruft Sitzungen, entfernt Abonnements und Reset-Token, löscht eigene Chattexte und anonymisiert strukturierte Vorgangskontakte. |
| Push und Hintergrundaufgaben | Minutenweiser Takt, gespeicherte Job-Zeitpunkte und PostgreSQL-Sperren verhindern die Abhängigkeit vom Startzeitpunkt und parallele Worker-Läufe. Einzelne Jobfehler blockieren Sicherung und Berichte nicht. Ruhezeiten verschieben normale Nachrichten; dringende Warnkategorien behalten Vorrang. Zusammenfassungen werden pro Fälligkeit versendet. Warteschlangeneinträge zählen nicht als zugestellte Geräte. |
| Berichte | Abschlusszeitpunkt und erste öffentliche Antwort werden getrennt erfasst. Spätere Notizen verschieben den Abschluss nicht. Erledigungsquote bezieht sich auf die im Zeitraum neu angelegten Vorgänge. DGH-Tage werden korrekt geparst. Unbekannte Dauern und Vergleiche zeigen „–“. |
| Bedienung und Rollen | Ohne authentifizierten Verwaltungskontext gibt es keinen angenommenen Vollzugriff. Cockpit-Kennzahlen und Aufgaben werden rollenabhängig angezeigt. Schreibformulare sind im Lesezugang ausgeblendet; Serverberechtigungen bleiben maßgeblich. Jede Rolle kann eigene 2FA aktivieren. Darstellung lässt sich mit einem Knopf zurücksetzen. |
| Wartbarkeit und Betrieb | Gemeinsame Module für Datenschutz, Inhaltsveröffentlichung, Sperren, Scheduler und externe Sicherung. Abhängigkeiten sind auf den in CI geprüften Stand festgelegt. Betriebsregion und formale Freigaben werden ohne Bestätigung nicht automatisch als erledigt gewertet. |

## Konfiguration nach dem Deployment

1. **Kartenfreigaben:** Gewünschte bestehende Meldungen im Vorgang prüfen und für die Karte freigeben. Die Migration veröffentlicht nichts automatisch.
2. **Verbindliches Vier-Augen-Verfahren:** `CONTENT_APPROVAL_MODE=required` setzen, sobald organisatorisch gewünscht. Ohne zweiten berechtigten Zugang bleiben Änderungen dann in Prüfung. Der Standard `auto` erlaubt weiterhin nachvollziehbaren Einzelbetrieb, solange kein zweites berechtigtes Konto vorhanden ist.
3. **Lokale automatische Sicherung:** `BACKUP_DIRECTORY` muss ein dauerhaftes Verzeichnis sein. `BACKUP_ENCRYPTION_KEY` separat sicher aufbewahren. `BACKUP_RETENTION_DAYS` ist standardmäßig 30 Tage.
4. **Externe Sicherung:** Ein dediziertes HTTPS-WebDAV-Verzeichnis anlegen und `BACKUP_WEBDAV_URL`, `BACKUP_WEBDAV_USER`, `BACKUP_WEBDAV_PASSWORD` konfigurieren. Die Adresse darf keine Zugangsdaten, Query-Parameter oder Fragmente enthalten. Automatische Sicherung starten und den verifizierten Status prüfen. Der externe Speicher muss unabhängig vom Render-Webservice sein.
5. **Audit:** `AUDIT_SIGNING_SECRET` sicher sichern. Bestehende Schlüssel nicht beiläufig ändern: ein Wechsel würde die Prüfung alter Signaturen beeinträchtigen. Vor Änderungen an Schlüsseln ist ein dokumentierter Archiv-/Rotationsplan nötig.
6. **E-Mail-Bestätigung:** Nach einem erfolgreichen Test des Mailversands `EMAIL_VERIFICATION_REQUIRED=true` setzen. Neue Registrierungen erhalten erst nach Bestätigung Zugriff. Bestehende Konten bleiben nutzbar und werden nicht nachträglich als bestätigt ausgegeben. `SMTP_HOST`, `SMTP_PORT`, optional `SMTP_SSL=true` und `SMTP_USER` erlauben ein Funktionspostfach jenseits des bisherigen Gmail-Servers. `EMAIL_USER`/`EMAIL_PASSWORD` bleiben Absender und Kennwort.
7. **Regionen:** `RENDER_REGION` und `DATABASE_REGION` getrennt anhand der tatsächlichen Betreiberkonsole hinterlegen. Diese Angaben ersetzen keinen Hostingnachweis.

## Wiederherstellung üben

Produktionswebservice und Hintergrundjobs müssen während eines echten Restores angehalten sein. Zuerst die Sicherung und den dazu passenden Code-/Schemastand in einer **getrennten Testdatenbank** wiederherstellen. Neue Tabellen oder Spalten sind absichtlich ein Abbruchgrund, bis der passende Schemastand hergestellt wurde. Das verhindert stilles Überspringen unbekannter Daten.

`python scripts/restore_backup.py sicherung.ahnsenbak` prüft die Datei ohne Änderung. Erst `--confirm RESTORE-AHNSEN` führt den Restore aus. Das Kennwort kommt aus `BACKUP_RESTORE_PASSPHRASE` oder der geschützten Eingabe. Nach dem Restore Anmeldungen, Bilder, Vorgänge und einen neuen Datensatz prüfen. Datum, Sicherungsdatei, Code-Commit, Prüfer, Ergebnis und benötigte Zeit im Betriebsprotokoll festhalten. Erst danach gilt ein betrieblicher Wiederherstellungstest als abgeschlossen.

## Bewusste Grenzen

- Ein grüner CI-Restore ersetzt keinen Test einer echten Produktionssicherung und ihrer externen Kopie.
- Bereits vor diesem Update an Übersetzungsanbieter übermittelte Texte lassen sich durch ein Codeupdate nicht zurückholen. Der alte serverseitige Übersetzungscache ist ein gesonderter, verzichtbarer Datenbestand und kann nach Betreiberprüfung geleert werden.
- Kontolöschung ist keine rückwirkende Löschung aller Sicherungen. Aufbewahrungsfristen und Nachbearbeitung von Löschungen nach einem Restore gehören ins Betriebskonzept. Freie Vorgangstexte können trotz Entfernung bekannter Kontaktdaten weitere personenbezogene Angaben enthalten; aufbewahrte Vorgänge und Moderationsnachweise müssen deshalb nach festgelegten Fristen fachlich geprüft werden. Das System behauptet keine vollständige Anonymisierung sämtlicher historischer Nachweise.
- Die Audit-Kette und ihr Datenbankkopf erkennen versehentliche oder partielle Änderungen. Eine Person mit vollständigem Datenbank- **und** Schlüsselzugriff könnte beide ändern. Eine unabhängige unveränderliche Archivierung ist damit noch nicht ersetzt.
- Push bestätigt die Annahme durch den Push-Dienst, nicht das Lesen oder die tatsächliche Anzeige auf dem Handy. Bei Prozessabbruch zwischen externer Annahme und lokaler Verbuchung bleibt ein Wiederholungsrisiko. Garantierte genau-einmalige Zustellung ist nicht gegeben.
- Alte Vorgänge besitzen nicht nachträglich verlässlich rekonstruierbare Antwort- und Abschlusszeiten. Diese Werte bleiben unbekannt; historische Monatsberichte werden nicht still überschrieben.
- Verträge und Zahlungen für das DGH, eine eigenständige Vereinsverwaltung und echte Datenisolation für mehrere Gemeinden sind gesonderte Produktentscheidungen. Dieses Update stabilisiert die vorhandenen Dienste.
- Impressum, Datenschutzfreigabe, manuelle Barrierefreiheitsprüfung, echte Betreiberangaben, externe Zugangsdaten, Betriebszuständigkeiten und GitHub-Regeln müssen vom Betreiber tatsächlich festgelegt werden. Technische Anzeigen ersetzen diese Entscheidungen nicht.
