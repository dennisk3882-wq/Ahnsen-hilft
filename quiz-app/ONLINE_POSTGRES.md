# Online-Mehrspieler mit PostgreSQL

Der Online-Mehrspieler verwendet automatisch die bestehende Umgebungsvariable `DATABASE_URL`.

Beim ersten Start wird die Tabelle `quiz_online_rooms` selbstständig angelegt. Darin werden aktive Räume als JSONB gespeichert. Nach einem Render- oder Node-Neustart lädt die Anwendung alle noch gültigen Räume wieder und setzt einen laufenden Fragentimer korrekt fort beziehungsweise löst eine bereits abgelaufene Frage auf.

Gespeichert werden Raumkonfiguration, Spielphase, Fragen, Antworten, Punkte, Teams, Chat und Spieler. Die ausgegebenen Spielertokens werden nicht im Klartext gespeichert, sondern ausschließlich als SHA-256-Hash.

Räume laufen 24 Stunden nach der letzten Spielaktion ab und werden anschließend automatisch aus Arbeitsspeicher und PostgreSQL entfernt.

Ohne `DATABASE_URL` bleibt der Online-Modus funktionsfähig, Räume überstehen dann jedoch keinen vollständigen Serverneustart. In der Online-Konfiguration und unter `/api/online/status` wird angezeigt, ob `postgresql` oder der Arbeitsspeicher-Fallback aktiv ist.
