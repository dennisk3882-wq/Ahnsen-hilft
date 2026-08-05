# QuizTime 13.1 – technische Härtung

## Datenbankstart

- Das Basisschema für Fragenkataloge, Livezustand und Quizläufe wird vor allen Plattformmodulen angelegt.
- Profil-, Konto-, Sozial-, Spiel-, Phase-10- und Migrationsschema starten danach strikt nacheinander.
- Ist `DATABASE_URL` gesetzt, beendet ein Initialisierungsfehler den Prozess. Ein stiller Produktionsstart im Offline-Modus ist nicht mehr zulässig.

## PostgreSQL-16-Kompatibilität

- Online-Spieler werden über `jsonb_object_keys` statt über die nicht vorhandene Funktion `jsonb_object_length` gezählt.
- Analytics-Zeitreihen verwenden eindeutige interne Aliasnamen und geben weiterhin das API-Feld `day` zurück.
- Fehler in optionalen Adminabfragen werden mit Bezeichnung protokolliert, statt vollständig unsichtbar zu bleiben.

## Testhärtung

- Browsertests speichern nach jedem Lauf das PostgreSQL-Protokoll.
- Jede Zeile mit `ERROR`, `FATAL` oder `PANIC` lässt den Browserjob fehlschlagen.
- Playwright ist getrennt von den Produktionsabhängigkeiten in `e2e-tools/package-lock.json` auf Version 1.61.1 gesperrt.
- Der Produktionstest wartet auf genau den Commit, den Render tatsächlich ausgeliefert hat.

## Laufzeit und CI

- Anwendung und CI sind auf Node.js 24 mit der Obergrenze `<25` festgelegt.
- GitHub Actions verwenden Node-24-fähige Hauptversionen von Checkout, Setup Node und Upload Artifact.
