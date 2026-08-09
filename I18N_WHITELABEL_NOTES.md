# Mehrsprachigkeit und White-Label

Dieser Stand vervollständigt die in der Bürgerplattform vorbereitete Mehrsprachigkeit und White-Label-Grundlage.

## Vollübersetzung

- Die Sprachwahl in der Kopfzeile ist konfigurierbar und unterstützt standardmäßig DE, EN, PL, UA, TR, FR, ES, IT, NL, RO, CZ, DK, SE, AR und RU.
- Sichtbare Seitentexte, dynamisch nachgeladene Inhalte sowie relevante Attribute wie Platzhalter, Titel und ARIA-Beschriftungen werden bei Auswahl einer Fremdsprache über einen LibreTranslate-kompatiblen Dienst übersetzt.
- Standardmäßig werden kostenlose öffentliche LibreTranslate-Endpunkte mit Fallback verwendet; die URLs können im Verwaltungsbereich geändert werden.
- Übersetzte Segmente werden persistent in der Datenbank zwischengespeichert.
- Bei Ausfall des externen Dienstes bleibt die Plattform benutzbar und zeigt den deutschen Originaltext statt einen Seitenfehler zu erzeugen.
- Inhalte, die Nutzer gerade in Formularfelder eingeben, werden bewusst nicht ungefragt an den Übersetzungsdienst übertragen.
- Im Datenschutzbereich wird auf die maschinelle Übersetzung und die Übermittlung sichtbarer Seitentexte hingewiesen.

## White-Label

Die zentrale Plattform-Konfiguration steuert nun unter anderem:

- Plattformname, Kurzname, Gemeinde, Claim und Beschreibung
- Primär- und Akzentfarbe
- Logo, Hero-Bild und PWA-/Apple-Icons
- PWA-Slug, Manifest-Metadaten und Ticket-Präfix
- Standardsprache und verfügbare Sprachen
- Kartenmittelpunkt und Zoom
- Warngebietsbegriffe, DWD- und BBK/MoWaS-Quellen
- Kontakt-/Absenderdaten, Webseite, Datenschutz und Impressum
- öffentliche Basis-URL und Zeitzone
- Ortsgeschichte: Ahnsen-Chronik oder individueller Gemeindetext

Push-Texte, E-Mails, Müll-Erinnerungen, Warnzentrale, Suche, Bürgerseiten und Verwaltungsbereich greifen auf diese Laufzeitkonfiguration zurück. Die Produktionsdatei `pwa_main.py` verwendet ebenfalls die White-Label-Daten für Manifest, PWA-Skripte und App-Identität.

## Technischer Schutz

Die Community-Routen werden im tatsächlichen Produktions-Einstiegspunkt abgesichert, damit Übersetzung, Suche, Karte, Ideen, Nachbarschaft, Politik und Plattform-Verwaltung unabhängig von der Importreihenfolge registriert bleiben.
