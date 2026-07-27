# Ahnsen Live-Quiz v6

## Notfallsteuerung

- Laufende Frage abbrechen und ohne Wertung wiederholen
- Einzelne Frage überspringen
- Ausgeschlossene Spieler im Adminbereich wiederherstellen
- Quizpause für 5, 10 oder 15 Minuten
- Großer synchroner Pausentimer auf Teilnehmer- und Beameransicht
- Pause vorzeitig abbrechen

## Livebetrieb

- Serverseitige Zeit- und Punkteberechnung
- Persistenter Live-Spielstand in Neon
- Doppelte Quizmasterbefehle werden serverseitig abgefangen
- Verbindungslatenz je Spieler in der Quizmasterübersicht
- Akustisches Signal in den letzten fünf Sekunden

## Fragenkataloge

- Erwachsenenquiz: 300 Fragen
- Kinderquiz: 200 Fragen
- Kategorien beim Erwachsenenquiz: Allgemeinwissen, Geografie, Geschichte, Natur & Wissenschaft, Musik, Sport, Film & Fernsehen, Technik, Essen & Trinken
- Kategorien beim Kinderquiz: Allgemeinwissen, Natur & Tiere, Geografie, Geschichte, Musik, Sport, Film & Fernsehen
- Gemischte Auswahl verteilt Fragen möglichst gleichmäßig über die gewählten Kategorien
- Variable Fragenzahl

## Präsentation

- Zwischenrangliste auf Teilnehmerhandys und Beamer
- Animiertes Siegerpodest
- Antwortverteilung nach der Auflösung auf dem Beamer
- Beamer-Vollbildmodus über die Fullscreen-API

## Build-Prüfungen

Der Render-Build prüft vor der Installation:

1. SHA-256 des vollständigen Archivs: `83984616269a7a898b112c9ca4cb61d606ab8b82ef1babfee3da4f15d0a18279`
2. GZIP-Integrität
3. JavaScript-Syntax
4. Punkteberechnung
5. Eindeutigkeit, Kategorien und Umfang beider Fragenkataloge

Lokal geprüfte Testergebnisse:

- `Scoring tests passed.`
- `Catalog tests passed.`
