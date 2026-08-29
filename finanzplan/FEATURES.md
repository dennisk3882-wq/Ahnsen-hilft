# Status der 45 gewünschten Funktionen – Finanzplan V3.1

Legende: ✅ produktiv umgesetzt · 🟠 technisch umgesetzt, aber externer Provider/Zugang noch erforderlich · ❌ fehlt

1. ✅ Dashboard / Startseite – Neo-Dashboard, Safe-to-Spend, Tagesbudget, Charts, Reichweite, Autopilot und Prognoseband
2. ✅ Konten – Eröffnungssaldo, centgenauer Ledger, Abgleichpunkte, Umbuchungen und Same-Account-Schutz
3. ✅ Regelmäßige Einnahmen – wöchentlich, 14-tägig, monatlich, vierteljährlich, halbjährlich und jährlich
4. ✅ Regelmäßige Ausgaben / Fixkosten – exakte Start-/Endregeln und synchronisierte Zukunftsbuchungen
5. ✅ Variable Ausgaben – Split, Beleg, Teilrückerstattung und Duplikatprüfung
6. ✅ Kategorien und Unterkategorien – inklusive Händlerregeln
7. ✅ Monatsbudget – Warnschwellen und Netto-Rückerstattungen
8. ✅ Monatsabschluss – historisches Nettovermögen am Stichtag
9. ✅ Finanzkalender
10. ✅ Cashflow-Prognose – zentrale Ereignisliste plus konservatives/Basis/optimistisches Prognoseband
11. ✅ Sparziele – Kontotöpfe ohne Doppelbelegung
12. ✅ Rücklagen – automatische/reversible Vertrags- und Versicherungsrücklagen ohne Safe-to-Spend-Doppelzählung
13. ✅ Verträge & Abonnements – Zahlungsplanung, Fristen, Restore, Preis- und Kündigungsprüfung
14. ✅ Versicherungen – Zahlung, Kündigungsfrist und Rücklage verbunden
15. ✅ Kredite und Schulden – Restschuld, Tilgungsplan, Zins, Rate, Sondertilgung und relationale Wiederherstellung
16. ✅ Vermögensübersicht – Konten/Schulden plus Immobilien, Wertpapiere, Fahrzeuge, Edelmetalle und sonstige Werte
17. ✅ Haushaltsansicht / Personenzuordnung – lokale Profile und Rollen
18. ✅ Gemeinsame Nutzung – Supabase Auth, Haushalte, owner/admin/adult/limited, RLS, Einladungen, datensatzweiser Sync, optimistische Versionskonflikte und Beleg-Sync
19. ✅ Belege & Dokumente – IndexedDB, Papierkorb, Verschlüsselung, Cloud-Beleg-Sync und Vollbackup
20. ✅ Suche und Filter – inklusive Split- und Refund-Buchungen
21. ✅ Statistiken
22. ✅ Jahresübersicht und Vorjahresvergleich
23. ✅ Monats- und Jahreskosten
24. ✅ Automatische Hochrechnung – Tempo + Historie + Planung + Unsicherheitsband
25. ✅ Intelligente Hinweise – Preissteigerungen, Anomalien, Dubletten und Autopilot-Maßnahmen
26. ✅ Notgroschen – Reichweite mit konfigurierbaren essenziellen variablen Kategorien
27. ✅ Szenario-Rechner
28. ✅ Anschaffungs-Rechner
29. ✅ Urlaubs-/Projektbudgets – Zeitraum, Tags, Unterkategorien, Splits und Refunds
30. ✅ Wiederkehrende Buchungen – exakte Serien-Synchronisierung
31. ✅ Flexible/geschätzte Fixkosten – Soll/Ist
32. ✅ Benachrichtigungen – Service-Worker-Web-Push, Geräte-Subscription, Supabase Edge Dispatcher und aktiver 5-Minuten-Cron
33. ✅ Dashboard individuell anpassbar – ein-/ausblendbar, Reihenfolge und Drag & Drop
34. ✅ Dark Mode
35. ✅ Mobile PWA – responsive, Bottom-Navigation, Schnellmenü, Offline-Cache und Installationsbutton nur im Browser
36. ✅ Schnellerfassung – Ausgabe, Einnahme, Umbuchung, Rückerstattung, Beleg
37. ✅ Bankdatei-Import – CSV, XLS, XLSX, XML, QIF, OFX, MT940 und CAMT.053 mit Mapping/Deduplizierung
38. 🟠 Automatische Bankanbindung – N26/Enable-Banking-Consent, Session-, Saldo- und Transaktionsbridge ist implementiert; es fehlen nur der persönliche Enable-Banking-App-Zugang/Private-Key und einmaliger N26-Consent
39. ✅ Export – CSV, Excel-kompatibel, PDF, JSON und verschlüsseltes binäres `.fplan`-Vollbackup mit Belegen
40. ✅ Datensicherung – Undo, Papierkorb, Snapshots, Vollbackup und Reset-Schutz
41. ✅ Datenschutz & Sicherheit – AES-256-GCM-Tresor, PBKDF2, verschlüsselte Belege, Memory-Lock, PIN, WebAuthn und PRF-Cold-Start-Passkey soweit vom Gerät unterstützt
42. ✅ Demo-/Privatmodus
43. ✅ Finanz-Score
44. 🟠 KI-Finanzassistent – lokaler deterministischer Analyst ist immer kostenlos verfügbar; Geräte-KI wird genutzt, falls der Browser `LanguageModel` anbietet; freie Cloud-KI ist vorbereitet und benötigt optional einen API-Key
45. ✅ Startseiten-Kurzprognose – Safe-to-Spend, Tagesbudget, Reichweite und Prognoseband

## Summe V3.1

- ✅ Produktiv/innerhalb der eingerichteten Finanzplan-Infrastruktur umgesetzt: **43**
- 🟠 Nur noch externer Provider/Zugang erforderlich: **2**
- ❌ Komplett fehlend: **0**

Die zwei orange markierten Bereiche sind keine fehlenden UI-/Engine-Funktionen: **N26-Auto-Sync** braucht aus regulatorischen Gründen einen zugelassenen PSD2-Vermittler-Zugang; **optionale generative Cloud-KI** braucht einen externen Modell/API-Zugang. Finanzplan funktioniert ohne beide vollständig local-first.

## V3/V3.1 Härtung

- Strukturierte Finanzdaten werden primär in IndexedDB gespeichert; kein temporärer Klartext-Spiegel in LocalStorage beim normalen Start.
- Kern-Geldberechnungen besitzen eine Integer-Cent-Schicht.
- Tageswechsel wird bei offen gelassener PWA erkannt.
- Service Worker cached nur explizite statische Same-Origin-Dateien; externe Sync-/Banking-/KI-APIs werden nicht gecacht.
- Same-Account-Transfers, Übererstattungen, Split-Refunds, relationale Restore-Pfade, Rücklagen-Rollback und Safe-to-Spend-Doppelzählung sind regression-getestet.
- Verschlüsseltes Vollbackup enthält echte Belegdateien und kann in einer frischen Browserinstanz wiederhergestellt werden.
- Tresor-Lock entfernt Schlüssel und Klartextzustand aus dem Arbeitsspeicher.
- Multiuser-Datenbank verwendet Supabase Row Level Security; der Supabase Security Advisor meldet im gehärteten Zustand keine Security-Lints.
- `finance-documents` ist ein privater Storage-Bucket mit 20-MB-Dateilimit.
- Push-Dispatcher ist als Supabase Edge Function aktiv; Cron `finanzplan-push-dispatch` läuft alle 5 Minuten.
- Render-Live-Seite liefert die eingerichteten Security-Header (CSP, HSTS, nosniff, Referrer-Policy usw.).
- PWA besitzt native 192/512-PNGs, maskable Icon und Offline-Cache `finanzplan-v3.1.0`.

## Testabdeckung V3.1

GitHub Actions prüft Syntax/Finanzregression plus echte Browserflows in Chromium und WebKit: Baseline, Accounting-Härtung, V3-Edge-Cases, IndexedDB/Backup/Restore, 10.000 zusätzliche Buchungen, V2→V3-Migration, installierten PWA-Modus, Accessibility/Offline sowie V3.1-Autopilot, Assets, Monatsberichte und QIF/OFX/MT940/CAMT.053.
