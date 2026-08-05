# QuizTime 13 – Release, Qualität, Recht und Spielerbindung

## Betreiberangaben

Dennis Koch  
In der Flöte 19  
31708 Ahnsen  
Deutschland

Vor dem öffentlichen Betrieb muss in Render zusätzlich `LEGAL_CONTACT_EMAIL` mit einer dauerhaft erreichbaren Kontaktadresse gesetzt werden.

## Phase 12.1 – Produktionsabnahme

- öffentlicher Bereitschaftsendpunkt `/api/platform/release-readiness`
- Prüfung von PostgreSQL, Migration 120, beiden 500er-Katalogen, E-Mail, Impressumskontakt, Backups und zentraler Fehlerquote
- gespeicherte Prüfhistorie im Adminbereich
- automatischer Produktions-Smoke-Test

## Phase 12.2 – technische Bereinigung

- automatisches Auffinden und Prüfen sämtlicher JavaScript-Dateien durch `scripts/check-js.js`
- zentrale Fehleraggregation mit Häufigkeit, Kontext und Erledigt-Status
- täglicher verschlüsselter PostgreSQL-Dump über GitHub Actions
- Wiederherstellungsprüfung in einer temporären PostgreSQL-Umgebung

## Phase 12.4 – Fragenqualität

- ausschließlich kontextbezogene Aktion „Diese Frage melden“ an einer aktuell angezeigten Quizfrage
- kein globaler Beta-, Ideen- oder Technik-Feedbackbutton aus Phase 12.3
- Meldungsübersicht und Fragenstatistik im Adminbereich
- sofortige zentrale Deaktivierung
- redaktionelle Korrektur mit archivierter Vorversion

## Phase 12.5 – Recht und Datenschutz

- Impressum, Datenschutzerklärung, Nutzungsbedingungen und Kinder-/Elterninformationen unter `/legal`
- Betreiberanschrift technisch hinterlegt
- Datenexport und Kontolöschung im Kontocenter
- versionierte Zustimmung
- bei Altersgruppe unter 16: Bestätigung durch eine erziehungsberechtigte Person per E-Mail-Link
- keine nicht notwendigen Tracking-Cookies in Phase 13

Die bereitgestellten Texte sind technische Vorlagen und ersetzen keine individuelle rechtliche Prüfung.

## Phase 13 – Spielerbindung

- tägliche und längste Aktivitätsserie
- persönliches Wochenziel
- 30-Tage-Aktivitätsübersicht
- persönliche Rekorde und zusätzliche Abzeichen
- Empfehlungen anhand bisheriger Kategorien
- Aktivitäten bestätigter Freunde
- optionale interne Erinnerungen
- Fortschrittsseite `/progress`
