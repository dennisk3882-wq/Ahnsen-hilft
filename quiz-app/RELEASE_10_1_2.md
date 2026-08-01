# QuizTime 10.1.2

## Behoben

Persistente Solo-Runden speichern die bereits gemischte Reihenfolge der Antwortmöglichkeiten in PostgreSQL. Diese gespeicherte Reihenfolge wird nicht mehr ein zweites Mal durch die Kompatibilitätsschicht übersetzt.

Damit gilt wieder zwingend:

- die angeklickte Antwort wird unverändert an die persistente Solo-Runde übergeben,
- die angezeigte richtige Antwort entspricht dem serverseitigen `correctIndex`,
- `result.correct` ist genau dann wahr, wenn `answerIndex === correctIndex`,
- Punkte, Statistik und Lernfortschritt verwenden dasselbe Ergebnis.

## Regressionstest

Der vollständige 50-Fragen-Browsertest klickt abwechselnd A, B, C und D und prüft bei jeder einzelnen Frage die Konsistenz zwischen ausgewählter Position, richtiger Position und dem Wahrheitswert `correct`.
