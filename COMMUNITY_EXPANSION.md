# Ausbau Bürgerplattform

Dieser Entwicklungsstand erweitert „Ahnsen hilft“ um zusätzliche Bürger- und Verwaltungsfunktionen.

## Bürgerbereich

- intelligente Suche über Dienste, Veranstaltungen, Bürgerinformationen, Politik, Ideen, Nachbarschaftshilfe und Ortsgeschichte
- erweitertes Bürgerkonto („Mein Ahnsen“) mit persönlichem Postfach und Schnellübersicht
- öffentliche, datensparsame Mängelkarte auf Basis vorhandener GPS-Meldungen
- persönlicher digitaler Briefkasten mit ungelesen-Badge
- Ideenportal mit Unterstützung und Kommentaren
- Politik-&-Rat-Bereich für Sitzungen, Beschlüsse, Tagesordnungen und Bekanntmachungen
- moderierte Nachbarschaftshilfe mit Such-/Biete-Beiträgen und Beispielanwendungen
- intelligente Push-Zustellung: dringende Vorgänge sofort, normale Hinweise optional sofort oder als Zusammenfassung
- Sprachwahl DE/EN/PL/UA/TR in der Kopfzeile für die übersetzten Kernoberflächen

## Verwaltung

- Verwaltungs-Cockpit 2.0 mit zentralen Kennzahlen und offenen Aufgaben
- persönlicher Nachrichtenversand an Bürgerkonten
- Moderation von Ideen und Nachbarschaftsbeiträgen
- Pflege von Politik-&-Rat-Inhalten
- Audit-Log für wichtige Verwaltungsänderungen
- durchsuchbare gespeicherte Digitalberichte
- zentrale White-Label-Konfiguration für Plattformname, Gemeinde, Claim, Farben und Warngebietsbegriffe

## Datenschutz

- Die öffentliche Mängelkarte zeigt keine Namen, Kontaktdaten, internen Notizen oder Fotos.
- GPS-Koordinaten werden vor öffentlicher Ausgabe gerundet; Hausnummern werden aus dem öffentlichen Ortslabel entfernt.
- Nachbarschaftsbeiträge werden erst nach Verwaltungsfreigabe öffentlich.
- Persönliche Nachrichten sind nur nach Anmeldung im jeweiligen Bürgerkonto sichtbar.

## Ausbaugrenzen dieses Schritts

Die Sprachumschaltung deckt die Kernnavigation und häufige UI-Texte ab. Frei eingegebene Inhalte, historische Langtexte und amtliche Originaltexte werden nicht automatisch maschinell übersetzt, solange kein externer Übersetzungsdienst konfiguriert ist.

Die White-Label-Konfiguration bildet die technische Grundlage für weitere Gemeinden. Bestehende Ahnsen-spezifische Datenquellen, Fachinhalte und einzelne Texte bleiben in diesem Entwicklungsschritt bewusst unverändert und müssten für eine vollständig generische Multi-Gemeinde-Version weiter parametrisiert werden.
