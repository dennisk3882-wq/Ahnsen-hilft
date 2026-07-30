# QuizTime 10.1 – Stabilität und Betrieb

## Zweck

Version 10.1 schließt die in der Phase-10-Prüfung erkannten Daten-, Saison-, Event-, Turnier- und Profil-Lücken. Wettbewerbliche Ergebnisse werden idempotent und transaktionssicher gespeichert. Laufende Solo- und Online-Sitzungen überstehen einen Prozessneustart.

## Erforderliche Produktionsvariablen

Der Server startet unter `NODE_ENV=production` nur, wenn folgende Werte gesetzt sind:

- `DATABASE_URL`
- `EVENT_PASSWORD`
- `ADMIN_PASSWORD`
- `PROFILE_SESSION_SECRET` mit mindestens 32 Zeichen
- `PLATFORM_SECURITY_SECRET` mit mindestens 32 Zeichen
- `PLATFORM_INTERNAL_SECRET` mit mindestens 32 Zeichen und unabhängig von allen anderen Passwörtern

Nach einer Änderung an `render.yaml` muss das Render-Blueprint synchronisiert oder die Variable im Dashboard angelegt werden.

## Migrationen

Beim Start wird `migration-runner.js` ausgeführt. Jede Datei unter `migrations/` wird in einer PostgreSQL-Transaktion angewendet und mit SHA-256-Prüfsumme in `quiz_schema_migrations` dokumentiert. Bereits angewendete Migrationen dürfen nachträglich nicht verändert werden.

Statusprüfung:

```text
GET /api/platform/stability/status
```

Erwartet werden `version: 10.1.0`, `databaseReachable: true` und die Migrationen `010_phase10_stability.sql` sowie `011_solo_sessions.sql`.

## Ergebnis- und Belohnungssicherheit

- Jedes Online-Ergebnis erhält einen eindeutigen `result_key`.
- Historie, allgemeines Match-Ergebnis, Saisonpunkte und Duell-/Turnierfortschritt werden gemeinsam in einer Transaktion verbucht.
- Missions-, Event-, Saison-, Duell- und Turnierbelohnungen verwenden ein Reward-Ledger.
- Wiederholte Requests oder Neustarts erzeugen keine doppelte Gutschrift.
- Der Admin-Abgleich verarbeitet fertige, noch nicht verbuchte Räume nach.

## Konten

Community, Arena, Duelle, Matchmaking, Turniere und Belohnungen erfordern eine bestätigte E-Mail-Adresse. Unbestätigte und vollständig ungenutzte Profile werden nach sieben Tagen entfernt.

## Freunde und Benachrichtigungen

- Stummschaltung und Benachrichtigungseinstellung werden je bestätigtem Freund getrennt gespeichert.
- Raum-, Duell- und Turnierhinweise werden serverseitig anhand dieser Einstellungen gefiltert.
- Eine ausgeschaltete Benachrichtigung verhindert nicht die eigentliche Einladung; sie bleibt im Einladungsbereich abrufbar.
- Unterdrückte In-App-Hinweise lösen auch keinen leeren Push-Impuls aus.
- Ein Zwei-Konten-Browsertest prüft „stumm“, „Benachrichtigungen aus“ und erneutes Aktivieren.

## Events

- Ein Versuch wird bereits beim Start reserviert.
- Pro Profil und Event existiert höchstens eine fortsetzbare offene Runde.
- Zukünftige Events erscheinen mit Countdown und können noch nicht gestartet werden.
- Tages- und Wochenperioden werden in `Europe/Berlin` inklusive Sommer-/Winterzeit berechnet.

## Liga und Saison

- Die Liga wird dauerhaft je Profil gespeichert.
- Auf- und Abstieg erfolgen beim regulären Saisonende innerhalb der jeweiligen Liga.
- Abgelaufene Saisons werden stündlich automatisch archiviert.
- Die besten drei Spieler jeder Liga erhalten transaktionssichere Saisonbelohnungen.
- Eine laufende Saison kann nicht versehentlich vor ihrem Enddatum abgeschlossen werden.

## Turniere

- Quiztyp, Kategorie und Fragenzahl stammen aus den Turniereinstellungen.
- Bei vollständigem Gleichstand wird keine Seite bevorzugt. Die Partie wird als Entscheidungsrunde mit fünf Fragen erneut freigegeben.
- Admins können festhängende Turnier- und Duellräume zurücksetzen.

## Solo, Offline und Live

- Laufende Solo-Sitzungen werden als JSONB in PostgreSQL gespeichert und können nach einem Neustart fortgesetzt werden.
- Offline- und Live-Ergebnisse können nach Bestätigung durch den angemeldeten Nutzer in dessen Historie übernommen werden.
- Offline-/Live-Importe sind ausdrücklich von der wettbewerblichen Liga ausgeschlossen.

## Fragenkatalog

Die 500 Dateien unter `data/` bilden den verbindlichen redaktionellen Standardkatalog für Solo, Offline, Online, Duelle, Turniere und offizielle Events. Zusätzliche Adminfragen bleiben bis zur redaktionellen Veröffentlichung im Live-Quiz. Der Stabilitätsstatus vergleicht Standard- und Datenbankversion und zeigt Abweichungen im Adminbereich.

## Abhängigkeitssicherheit

Express ist auf `4.22.2` aktualisiert. Damit werden die im Sicherheitsscan erkannten DoS-Schwachstellen in `body-parser`, `path-to-regexp` und `qs` über einen reproduzierbar erneuerten Lockfile behoben. Der Pull Request wird zusätzlich mit `npm audit` und CodeQL geprüft.

## Backup

Kritische Tabellen exportieren:

```bash
npm run backup:critical
```

Wiederherstellung nur nach vorheriger Prüfung und mit expliziter Bestätigung:

```bash
npm run restore:critical -- backups/<datei>.json --confirm=RESTORE
```

Die Wiederherstellung ergänzt ausschließlich fehlende Primärschlüssel. Sie überschreibt keine bestehenden Datensätze.

## Vor jedem Produktionsdeploy

```bash
npm ci
npm run test:all
npm run test:browser
```

Nach dem Deploy zusätzlich den Produktions-Smoke-Test ausführen und `/api/platform/stability/status` kontrollieren.
