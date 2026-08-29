# Status der 45 gewünschten Funktionen – Finanzplan V3.2

Legende: ✅ produktiv umgesetzt · 🟠 technisch umgesetzt, aber externer Provider/Zugang noch erforderlich · ❌ fehlt

1. ✅ Dashboard / Startseite – Neo-Dashboard, Safe-to-Spend, Tagesbudget, Charts, Reichweite, Autopilot und Prognoseband
2. ✅ Konten – Eröffnungssaldo, centgenauer Ledger, Abgleichpunkte, Umbuchungen und Same-Account-Schutz
3. ✅ Regelmäßige Einnahmen – wöchentlich, 14-tägig, monatlich, vierteljährlich, halbjährlich und jährlich
4. ✅ Regelmäßige Ausgaben / Fixkosten – exakte Start-/Endregeln und synchronisierte Zukunftsbuchungen
5. ✅ Variable Ausgaben – Split, Beleg, Teilrückerstattung und Duplikatprüfung
6. ✅ Kategorien und Unterkategorien – Händlernormalisierung, manuelle Händlerregeln und lernende Kategorien
7. ✅ Monatsbudget – Warnschwellen und Netto-Rückerstattungen
8. ✅ Monatsabschluss – historisches Nettovermögen am Stichtag
9. ✅ Finanzkalender
10. ✅ Cashflow-Prognose – zentrale Ereignisliste plus konservatives/Basis/optimistisches Prognoseband
11. ✅ Sparziele – Kontotöpfe ohne Doppelbelegung
12. ✅ Rücklagen – automatische/reversible Vertrags- und Versicherungsrücklagen ohne Safe-to-Spend-Doppelzählung
13. ✅ Verträge & Abonnements – Zahlungsplanung, Fristen, automatische Abbuchungserkennung, Vertragskandidaten, Preis-/Kündigungsprüfung sowie Kündigungsassistent mit PDF, E-Mail und Nachweis
14. ✅ Versicherungen – Zahlung, Kündigungsfrist und Rücklage verbunden
15. ✅ Kredite und Schulden – Restschuld, Tilgungsplan, Zins, Rate, Sondertilgung und relationale Wiederherstellung
16. ✅ Vermögensübersicht – Konten/Schulden plus Immobilien, Wertpapiere, Fahrzeuge, Edelmetalle und sonstige Werte
17. ✅ Haushaltsansicht / Personenzuordnung – lokale Profile und Rollen
18. ✅ Gemeinsame Nutzung – Supabase Auth, Haushalte, owner/admin/adult/limited, RLS, Einladungen, datensatzweiser Sync, Versionskonflikte, Beleg-Sync und optional aktivierbare clientseitige E2EE
19. ✅ Belege & Dokumente – IndexedDB, Papierkorb, Tresorverschlüsselung, optional E2EE-verschlüsselter Cloud-Beleg-Sync und Vollbackup
20. ✅ Suche und Filter – inklusive Split- und Refund-Buchungen
21. ✅ Statistiken
22. ✅ Jahresübersicht und Vorjahresvergleich
23. ✅ Monats- und Jahreskosten
24. ✅ Automatische Hochrechnung – Tempo + Historie + Planung + Unsicherheitsband
25. ✅ Intelligente Hinweise – Preissteigerungen, Anomalien, Dubletten, Händlerlernen, Kategorieprognose und Autopilot-Maßnahmen
26. ✅ Notgroschen – Reichweite mit konfigurierbaren essenziellen variablen Kategorien
27. ✅ Szenario-Rechner
28. ✅ Anschaffungs-Rechner
29. ✅ Urlaubs-/Projektbudgets – Zeitraum, Tags, Unterkategorien, Splits und Refunds
30. ✅ Wiederkehrende Buchungen – exakte Serien-Synchronisierung
31. ✅ Flexible/geschätzte Fixkosten – Soll/Ist
32. ✅ Benachrichtigungen – Service-Worker-Web-Push, Geräte-Subscription, Supabase Edge Dispatcher, token-geschützter interner Cron und 5-Minuten-Ausführung
33. ✅ Dashboard individuell anpassbar – ein-/ausblendbar, Reihenfolge und Drag & Drop
34. ✅ Dark Mode
35. ✅ Mobile PWA – responsive, Bottom-Navigation, Schnellmenü, Offline-Cache und Installationsbutton nur im Browser
36. ✅ Schnellerfassung – Ausgabe, Einnahme, Umbuchung, Rückerstattung, Beleg
37. ✅ Bankdatei-Import – CSV, XLS, XLSX, XML, QIF, OFX, MT940 und CAMT.053 mit Mapping/Deduplizierung
38. 🟠 Automatische Bankanbindung – providerneutraler Banking-Hub sowie N26/Enable-Banking-Consent, Session-, Saldo- und Transaktionsbridge sind implementiert; es fehlen der persönliche Enable-Banking-App-Zugang/Private-Key und einmaliger N26-Consent
39. ✅ Export – CSV, Excel-kompatibel, PDF, JSON und verschlüsseltes binäres `.fplan`-Vollbackup mit Belegen
40. ✅ Datensicherung – Undo, Papierkorb, Snapshots, Vollbackup und Reset-Schutz
41. ✅ Datenschutz & Sicherheit – AES-256-GCM-Tresor, PBKDF2, verschlüsselte Belege, Memory-Lock, PIN, WebAuthn/PRF-Passkey und optionale clientseitige Cloud-E2EE; Server-Secrets sind aus Edge-Function-Quelltext ausgelagert
42. ✅ Demo-/Privatmodus
43. ✅ Finanz-Score
44. 🟠 KI-Finanzassistent – erweiterter lokaler deterministischer Analyst ist immer kostenlos/offline verfügbar; Geräte-KI wird bei Browserunterstützung genutzt; generative Cloud-KI ist vorbereitet und benötigt optional einen externen Modell/API-Zugang
45. ✅ Startseiten-Kurzprognose – Safe-to-Spend, Tagesbudget, Reichweite und Prognoseband

## Summe V3.2

- ✅ Innerhalb der eingerichteten Finanzplan-Infrastruktur vollständig umgesetzt: **43**
- 🟠 Nur noch externer Provider/Zugang erforderlich: **2**
- ❌ Komplett fehlend: **0**

Die zwei orange markierten Bereiche sind keine fehlenden UI-/Engine-Funktionen: **N26-Auto-Sync** benötigt aus regulatorischen Gründen einen zugelassenen PSD2-Vermittler-Zugang; **optionale generative Cloud-KI** benötigt einen externen Modell/API-Zugang. Finanzplan bleibt ohne beide vollständig local-first nutzbar.

## V3.2 Automation & Intelligence

- Händler werden normalisiert und aus bestätigten historischen Kategorien werden lernende Regeln mit Konfidenzwert erzeugt.
- Wiederkehrende, ausreichend stabile Abbuchungen werden als Vertragskandidaten erkannt.
- Kündigungsassistent erstellt Text/PDF, öffnet eine vorbereitete E-Mail und verwaltet Versandnachweise.
- Providerneutraler Banking-Hub trennt Bankanbieter von der Finanzengine; N26 ist als erster PSD2-Provider vorbereitet.
- Der lokale Finanzassistent beantwortet zusätzlich Spar-, Monatsvergleich-, Vertrags-, Anomalie- und Prognosefragen aus deterministisch berechneten Kennzahlen.
- Cloud-Datensätze und Cloud-Belege können mit einer nur dem Haushalt bekannten Passphrase clientseitig Ende-zu-Ende verschlüsselt werden.
- Technisches Monitoring protokolliert sanitizierte Runtime-, Cloud- und Banking-Fehler, ohne Buchungstexte/Beträge als Diagnoseinhalt zu senden.
- Ein zentrales V3.2-Einrichtungscenter zeigt Status für Banking, E2EE, Push, KI, Monitoring und die zehn Ausbaupunkte.
- Ein optionaler Capacitor-Wrapper ist für spätere Android/iOS-Verteilung vorbereitet; Store-Konten/Signaturen bleiben externe Voraussetzungen.

## Sicherheits- und Betriebs-Härtung

- Strukturierte Finanzdaten liegen primär in IndexedDB; kein normaler Klartext-State-Spiegel in LocalStorage.
- Kern-Geldberechnungen besitzen eine Integer-Cent-Schicht.
- Tageswechsel wird bei offen gelassener PWA erkannt.
- Service Worker cached nur explizite statische Same-Origin-Dateien; externe Sync-/Banking-/KI-APIs werden nicht gecacht.
- Verschlüsseltes Vollbackup enthält echte Belegdateien und ist in einer frischen Browserinstanz wiederherstellbar.
- Tresor-Lock und E2EE-Lock entfernen die jeweiligen Schlüssel aus dem Arbeitsspeicher.
- Supabase Row Level Security ist aktiv; der Security Advisor meldet im gehärteten V3.2-Zustand keine Security-Lints.
- RLS-Auswertung wurde für Skalierung optimiert und fehlende FK-Indizes wurden ergänzt; verbleibende Performance-Hinweise betreffen nur frisch angelegte, noch unbenutzte Indizes.
- `finance-documents` ist privat und auf 20 MB je Datei begrenzt.
- VAPID-Private-Key, Banking-State-HMAC und Dispatcher-Token liegen nur im privaten Server-Secret-Store; sie stehen nicht im Repository oder Edge-Function-Quelltext.
- `finanzplan-push-dispatch` akzeptiert keine anonymen Ausführungen mehr: ohne internen Token HTTP 401, über den internen Cron-Pfad HTTP 200.
- Render liefert CSP, HSTS, nosniff, Referrer-Policy und weitere konfigurierte Security-Header.
- PWA besitzt native 192/512-PNGs, maskable Icon und Offline-Cache `finanzplan-v3.2.0`.

## Testabdeckung V3.2

GitHub Actions prüft Syntax/Finanzregression plus echte Browserflows in Chromium und WebKit: Baseline, Accounting-Härtung, V3-Edge-Cases, IndexedDB/Backup/Restore, 10.000 zusätzliche Buchungen, V2→V3-Migration, installierten PWA-Modus, Accessibility/Offline, V3.1-Premiumregression sowie V3.2-Händlerlernen, Vertragserkennung, Kündigungslogik, E2EE-Kryptografie, Monitoring, Banking-Hub, KI-Erweiterung und V3.2-Offlinestart.

Ein echter externer Penetrationstest, ein vollständiger manueller WCAG-2.2-AA-Test mit realen Screenreadern und App-Store-Prüfungen bleiben naturgemäß externe Freigabeschritte, falls Finanzplan später öffentlich an viele Nutzer verteilt werden soll.
