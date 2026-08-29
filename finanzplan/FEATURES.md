# Status der 45 gewünschten Funktionen – Finanzplan V3.2

Legende: ✅ innerhalb Finanzplan vollständig umgesetzt · 🟠 Software vorbereitet, aber externer Provider/Zugang erforderlich · ❌ fehlt

1. ✅ Dashboard / Startseite – Neo-Dashboard, Safe-to-Spend, Tagesbudget, Charts, Reichweite, Autopilot und Prognoseband
2. ✅ Konten – Eröffnungssaldo, centgenauer Ledger, Abgleichpunkte, Umbuchungen und Same-Account-Schutz
3. ✅ Regelmäßige Einnahmen – wöchentlich, 14-tägig, monatlich, vierteljährlich, halbjährlich und jährlich
4. ✅ Regelmäßige Ausgaben / Fixkosten – exakte Start-/Endregeln und synchronisierte Zukunftsbuchungen
5. ✅ Variable Ausgaben – Split, Beleg, Teilrückerstattung und Duplikatprüfung
6. ✅ Kategorien und Unterkategorien – manuelle Händlerregeln plus lernende Händler-/Kategoriezuordnung
7. ✅ Monatsbudget – Warnschwellen und Netto-Rückerstattungen
8. ✅ Monatsabschluss – historisches Nettovermögen am Stichtag
9. ✅ Finanzkalender
10. ✅ Cashflow-Prognose – zentrale Ereignisliste plus konservatives/Basis/optimistisches Prognoseband
11. ✅ Sparziele – Kontotöpfe ohne Doppelbelegung
12. ✅ Rücklagen – automatische/reversible Vertrags- und Versicherungsrücklagen ohne Safe-to-Spend-Doppelzählung
13. ✅ Verträge & Abonnements – Zahlungsplanung, Fristen, automatische Erkennung wiederkehrender Abbuchungen, Kündigungsassistent, PDF/E-Mail und Nachweisverwaltung
14. ✅ Versicherungen – Zahlung, Kündigungsfrist und Rücklage verbunden
15. ✅ Kredite und Schulden – Restschuld, Tilgungsplan, Zins, Rate, Sondertilgung und relationale Wiederherstellung
16. ✅ Vermögensübersicht – Konten/Schulden plus Immobilien, Wertpapiere, Fahrzeuge, Edelmetalle und sonstige Werte
17. ✅ Haushaltsansicht / Personenzuordnung – lokale Profile und Rollen
18. ✅ Gemeinsame Nutzung – Supabase Auth, Haushalte, owner/admin/adult/limited, RLS, Einladungen, datensatzweiser Sync, Konfliktschutz, Beleg-Sync und optionale clientseitige E2EE
19. ✅ Belege & Dokumente – IndexedDB, Papierkorb, lokale Verschlüsselung, optional E2EE-verschlüsselter Cloud-Beleg-Sync und Vollbackup
20. ✅ Suche und Filter – inklusive Split- und Refund-Buchungen
21. ✅ Statistiken
22. ✅ Jahresübersicht und Vorjahresvergleich
23. ✅ Monats- und Jahreskosten
24. ✅ Automatische Hochrechnung – Tempo + Historie + Planung + Unsicherheitsband
25. ✅ Intelligente Hinweise – Preissteigerungen, Anomalien, Dubletten, Händlernormalisierung, Kategorie-Lernen, Vertragskandidaten und Autopilot-Maßnahmen
26. ✅ Notgroschen – Reichweite mit konfigurierbaren essenziellen variablen Kategorien
27. ✅ Szenario-Rechner
28. ✅ Anschaffungs-Rechner
29. ✅ Urlaubs-/Projektbudgets – Zeitraum, Tags, Unterkategorien, Splits und Refunds
30. ✅ Wiederkehrende Buchungen – exakte Serien-Synchronisierung
31. ✅ Flexible/geschätzte Fixkosten – Soll/Ist
32. ✅ Benachrichtigungen – Service-Worker-Web-Push, Geräte-Subscription, Supabase Edge Dispatcher, 5-Minuten-Cron und technisches Produktionsmonitoring
33. ✅ Dashboard individuell anpassbar – ein-/ausblendbar, Reihenfolge und Drag & Drop
34. ✅ Dark Mode
35. ✅ Mobile PWA – responsive, Bottom-Navigation, Schnellmenü, Offline-Cache und Installationsbutton nur im Browser
36. ✅ Schnellerfassung – Ausgabe, Einnahme, Umbuchung, Rückerstattung, Beleg
37. ✅ Bankdatei-Import – CSV, XLS, XLSX, XML, QIF, OFX, MT940 und CAMT.053 mit Mapping/Deduplizierung
38. 🟠 Automatische Bankanbindung – providerneutraler Banking-Hub sowie N26/Enable-Banking-Consent, Session-, Saldo-, Transaktions-, Händler- und Kategoriepipeline sind implementiert; persönlicher Enable-Banking-Zugang/Private-Key und einmaliger N26-Consent fehlen extern
39. ✅ Export – CSV, Excel-kompatibel, PDF, JSON und verschlüsseltes binäres `.fplan`-Vollbackup mit Belegen
40. ✅ Datensicherung – Undo, Papierkorb, Snapshots, Vollbackup und Reset-Schutz
41. ✅ Datenschutz & Sicherheit – AES-256-GCM-Tresor, PBKDF2, verschlüsselte Belege, Memory-Lock, PIN, WebAuthn/Passkey und optionale Cloud-E2EE; Multi-Device-Sync wird vor E2EE-Entsperrung blockiert
42. ✅ Demo-/Privatmodus
43. ✅ Finanz-Score
44. 🟠 KI-Finanzassistent – erweiterter lokaler Analyst für Kostentreiber, Sparansätze, Verträge, Anomalien und Prognosen ist kostenlos/offline verfügbar; Geräte-KI wird wenn verfügbar genutzt; optionale generative Cloud-KI benötigt externen Modell/API-Zugang
45. ✅ Startseiten-Kurzprognose – Safe-to-Spend, Tagesbudget, Reichweite und Prognoseband

## Summe V3.2

- ✅ Innerhalb der eingerichteten Finanzplan-Infrastruktur vollständig umgesetzt: **43**
- 🟠 Nur noch externer Provider/Zugang erforderlich: **2**
- ❌ Komplett fehlend: **0**

Die zwei orange markierten Bereiche bleiben dieselben externen Abhängigkeiten: **N26-Auto-Sync** benötigt einen zugelassenen PSD2-Vermittler-Zugang und anschließend den offiziellen N26-Consent; **generative Cloud-KI** benötigt einen externen Modell/API-Zugang. Finanzplan funktioniert ohne beide vollständig local-first.

## V3.2 – die zehn Automation-&-Intelligence-Ausbaupunkte

1. 🟠 **N26 Live-Banking:** komplette Softwarepipeline vorhanden; Enable-Banking-Zugang und Consent extern offen.
2. ✅ **Händlernormalisierung & Kategorie-Lernen:** kanonische Händleridentitäten und aus Historie gelernte Zuordnungen.
3. ✅ **Automatische Vertragserkennung:** wiederkehrende Abbuchungen werden nach Frequenz, Betrag und Historie bewertet.
4. ✅ **Kündigungsassistent:** Schreiben, PDF, vorbereitete E-Mail, Versandstatus und Nachweisdateien.
5. 🟠 **KI-Ausbau:** lokaler Analyst deutlich erweitert; generative Cloud-KI bleibt optional/external.
6. ✅ **Cloud-E2EE:** AES-GCM-verschlüsselte Finanzdatensätze und Belege mit Haushalts-Passphrase; Schlüssel bleibt clientseitig.
7. ✅ **Produktionsmonitoring:** sanitisierte technische Fehler-/Sync-Ereignisse; keine absichtliche Übertragung von Buchungstexten oder Beträgen als Telemetrie.
8. ✅ **UX/Onboarding:** zentrales V3.2-Einrichtungscenter für Banking, E2EE, KI und Monitoring.
9. ✅/extern **Audit-Härtung:** automatisierte Browser-, Offline-, Migration-, Security- und Accessibility-Regressionen; ein unabhängiger Penetrationstest/WCAG-Zertifizierung kann naturgemäß nur extern erfolgen.
10. ✅/extern **Weitere Banken & Native:** providerneutraler Banking-Hub und Capacitor-Wrapper-Vorbereitung sind vorhanden; reale zusätzliche Bankprovider und Store-Veröffentlichung benötigen externe Provider-/Store-Zugänge.

## Sicherheit und Härtung

- Strukturierte Finanzdaten liegen primär in IndexedDB; Legacy-Klartext-LocalStorage wird beim Start und nach jeder Speicherung entfernt.
- Kern-Geldberechnungen besitzen eine Integer-Cent-Schicht.
- Tageswechsel wird bei offen gelassener PWA erkannt.
- Service Worker cached ausschließlich explizite statische Same-Origin-Dateien; Banking-/Cloud-/KI-APIs werden nicht gecacht.
- Verschlüsseltes Vollbackup enthält echte Belegdateien und ist in einer frischen Browserinstanz wiederherstellbar.
- Tresor-Lock entfernt Schlüssel und Klartextzustand aus dem Arbeitsspeicher.
- Optionale Cloud-E2EE verschlüsselt `finance_records` und Cloud-Belegdateien clientseitig; ein neues Gerät muss vor dem Sync die Haushalts-Passphrase eingeben.
- Multiuser-Datenbank verwendet Supabase Row Level Security; `finance-documents` ist privat.
- Monitoring-Tabelle besitzt RLS; nur Haushaltsmitglieder dürfen eigene Ereignisse schreiben, owner/admin lesen.
- Supabase Security Advisor wird nach Schemaänderungen geprüft.
- Render-Live-Seite besitzt CSP, HSTS, nosniff und Referrer-Policy.
- PWA besitzt native 192/512-PNGs, maskable Icon und Offline-Cache `finanzplan-v3.2.0`.

## Testabdeckung V3.2

GitHub Actions prüft Syntax/Finanzregression sowie echte Browserflows in Chromium und WebKit: Baseline, Accounting-Härtung, Edge-Cases, IndexedDB/Backup/Restore, 10.000 zusätzliche Buchungen, V2→V3-Migration, installierten PWA-Modus, Accessibility/Offline, V3.1-Premiumregression sowie V3.2-Händlerlernen, Vertragserkennung, Kündigungstext, Banking-Hub, Monitoring-Sanitizing, E2EE-Kryptobasis und Offline-Persistenz.
