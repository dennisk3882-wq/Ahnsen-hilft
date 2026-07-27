# Ahnsen Live-Quiz online stellen

Die Quiz-Anwendung liegt vollständig auf dem Branch `ahnsen-live-quiz-online`. Der bestehende Branch `main` und die Anwendung **Ahnsen hilft** werden dadurch nicht verändert.

## Dauerhafte öffentliche Adresse über Render

1. Bei Render anmelden und **New > Blueprint** auswählen.
2. Das GitHub-Repository `dennisk3882-wq/Ahnsen-hilft` verbinden.
3. Als Branch `ahnsen-live-quiz-online` auswählen.
4. Als Blueprint-Datei `quiz-render.yaml` angeben.
5. Für `EVENT_PASSWORD` ein Teilnehmer-Passwort eintragen.
6. Für `ADMIN_PASSWORD` ein anderes, geheimes Quizmaster-Passwort eintragen.
7. Blueprint bestätigen und die Bereitstellung starten.

Render erstellt danach eine öffentliche HTTPS-Adresse. Die Bereiche sind:

- `/` – Anmeldung und Teilnehmeransicht
- `/admin` – Quizmaster-Dashboard
- `/screen` – Beamer- und Präsentationsansicht
- `/health` – technische Statusprüfung

## Kostenloser Render-Tarif

Der kostenlose Dienst kann nach längerer Inaktivität einschlafen. Deshalb die Seite spätestens einige Minuten vor dem Quizabend öffnen und während der Veranstaltung geöffnet lassen. Änderungen an Fragen und laufende Ergebnisse werden beim kostenlosen Tarif nicht dauerhaft über einen Neustart des Servers hinweg gespeichert. Die 25 Ausgangsfragen bleiben jedoch Bestandteil der Anwendung.

## Sofortiger Internet-Test vom eigenen Windows-PC

Alternativ die Datei `ahnsen-live-quiz-online.zip` entpacken und `start-online-windows.bat` starten. Dabei wird eine temporäre öffentliche Adresse erzeugt. Der PC und das Fenster müssen während des Tests eingeschaltet bleiben. Diese Variante ist für Tests gedacht, nicht als dauerhafte Veranstaltungsadresse.
