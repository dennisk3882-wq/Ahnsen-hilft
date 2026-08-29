# Status der 45 gewünschten Funktionen – Finanzplan v2.2

Legende: ✅ komplett in der PWA umgesetzt · 🟠 teilweise / externer Dienst nötig · ❌ fehlt

1. ✅ Dashboard / Startseite – Neo-Dashboard, Safe-to-Spend, Tagesbudget, Charts, Reichweite und Prognose
2. ✅ Konten – Eröffnungssaldo, Ledger, Abgleichpunkte, Umbuchungen und Schutz vor Same-Account-Transfers
3. ✅ Regelmäßige Einnahmen – wöchentlich, 14-tägig, monatlich, vierteljährlich, halbjährlich und jährlich
4. ✅ Regelmäßige Ausgaben / Fixkosten – exakte Start-/Endregeln und synchronisierte Zukunftsbuchungen
5. ✅ Variable Ausgaben – inklusive Split, Beleg, Teilrückerstattung und Duplikatprüfung
6. ✅ Kategorien und Unterkategorien – inklusive Händlerregeln
7. ✅ Monatsbudget – Warnschwellen und Netto-Rückerstattungen
8. ✅ Monatsabschluss – inklusive historischem Nettovermögen am Stichtag
9. ✅ Finanzkalender
10. ✅ Cashflow-Prognose – zentrale geplante Ereignisliste
11. ✅ Sparziele – echte Kontotöpfe ohne Doppelbelegung desselben Guthabens
12. ✅ Rücklagen – automatische und reversible Vertrags-/Versicherungsrücklagen ohne Safe-to-Spend-Doppelzählung
13. ✅ Verträge & Abonnements – direkt mit Zahlungsplanung, Fristen, Restore und Preisprüfung verbunden
14. ✅ Versicherungen – Zahlung, Kündigungsfrist und Rücklage verbunden
15. ✅ Kredite und Schulden – dynamische Restschuld, Tilgungsplan, Zins, Rate, Sondertilgung und relationale Wiederherstellung
16. ✅ Vermögensübersicht – aktuelle und historische Stichtagsberechnung
17. ✅ Haushaltsansicht / Personenzuordnung – lokale Profile und Rollensteuerung
18. 🟠 Gemeinsame Nutzung – verschlüsselter Ganzdaten-Sync mit ETag-Konfliktschutz; echtes gleichzeitiges Multiuser-Merging und sichere Benutzerkonten brauchen Backend/Auth
19. ✅ Belege & Dokumente – IndexedDB, Papierkorb, Verschlüsselung und Vollbackup mit echten Belegdateien
20. ✅ Suche und Filter – inklusive Split- und Refund-Buchungen
21. ✅ Statistiken
22. ✅ Jahresübersicht
23. ✅ Monats- und Jahreskosten
24. ✅ Automatische Hochrechnung – Tempo + Historie + geplante Zahlungen
25. ✅ Intelligente Hinweise – Preissteigerungen nur bei stabilen wiederkehrenden Mustern
26. ✅ Notgroschen – Reichweite mit konfigurierbaren essenziellen variablen Kategorien
27. ✅ Szenario-Rechner
28. ✅ Anschaffungs-Rechner
29. ✅ Urlaubs-/Projektbudgets – Zeitraum, Tags, Haupt-/Unterkategorien, Splits und Rückerstattungen
30. ✅ Wiederkehrende Buchungen – exakte Serien-Synchronisierung
31. ✅ Flexible/geschätzte Fixkosten – Soll/Ist-Vergleich
32. 🟠 Benachrichtigungen – Browser/Service-Worker und Push-Empfänger vorhanden; zuverlässige Zustellung bei geschlossener App braucht Push-Backend
33. ✅ Dashboard individuell anpassbar – ein-/ausblendbar, Reihenfolge und Drag & Drop
34. ✅ Dark Mode
35. ✅ Mobile PWA – responsive, Bottom-Navigation, Schnellmenü, Offline-Cache
36. ✅ Schnellerfassung – Ausgabe, Einnahme, Umbuchung, Rückerstattung, Beleg
37. ✅ CSV-/Excel-Import – CSV, XLS, XLSX, XML, deutsche Zahlen/Daten, Vorschau, Mapping und Duplikaterkennung
38. 🟠 Bankanbindung – PSD2/Open-Banking-Client vorbereitet; echter Consent und Kontozugriff brauchen lizenzierten Provider und Servercallback
39. ✅ Export – CSV, Excel-kompatibel, PDF, JSON und verschlüsseltes .fplan-Vollbackup
40. ✅ Datensicherung – Undo, Papierkorb, Snapshots und Vollbackup; Reset mit Belegen wird ohne frisches Vollbackup blockiert
41. ✅ Datenschutz & Sicherheit – optionaler AES-256-GCM-Tresor, PBKDF2, verschlüsselte Belege, echter Memory-Lock, PIN und optional WebAuthn
42. ✅ Demo-/Privatmodus
43. ✅ Finanz-Score
44. 🟠 KI-Finanzassistent – lokaler Finanzanalyst vorhanden; freie generative Antworten benötigen ein externes KI-Modell
45. ✅ Startseiten-Kurzprognose – Safe-to-Spend, Tagesbudget, erwartete Zu-/Abflüsse und Monatsende

## Summe v2.2

- ✅ Komplett innerhalb der PWA: **41**
- 🟠 Teilweise / externe Infrastruktur erforderlich: **4**
- ❌ Komplett fehlend: **0**

Die vier orange markierten Bereiche sind technisch vorbereitet, können aber nicht vollständig durch eine rein statische lokale PWA gelöst werden: echte Multiuser-Identitäten/konfliktfreies Merging, serverseitiges Web Push, PSD2-Bankzugriff und freie generative KI benötigen jeweils einen externen Dienst.

## Zusätzliche Härtung v2.2

- Same-Account-Transfers werden verhindert und haben auch auf Ledger-Ebene keinen Effekt.
- Teilrückerstattungen sind auf den noch offenen Originalbetrag begrenzt; Split-Rückerstattungen werden proportional auf die Ursprungskategorien verteilt.
- Verträge, Versicherungen, Kredite und wiederkehrende Regeln werden relational gelöscht/wiederhergestellt.
- Vertrags-/Versicherungsrücklagen sind reversibel: bezahlt → geplant → bezahlt liefert wieder denselben Zustand.
- Safe-to-Spend verrechnet eine zweckgebundene Rücklage mit der zugehörigen fälligen Rechnung statt beides doppelt abzuziehen.
- Mehrere Sparziele können dasselbe Kontoguthaben nicht mehrfach vollständig belegen.
- Projektbudgets berücksichtigen Unterkategorien, Splits und Rückerstattungen netto.
- Ein Reset mit aktiven oder noch im Papierkorb befindlichen Belegen erzwingt zuerst ein verschlüsseltes Vollbackup.
- Der Tresor-Auto-Lock entfernt den Entschlüsselungsschlüssel und Klartextdaten aus dem Arbeitsspeicher.
- Sync-Tokens werden nur sitzungsweise gehalten; ETag/If-Match schützt vor stillem Überschreiben einer geänderten Serverdatei.
- Service Worker enthält einen standardisierten Web-Push-Empfänger.
- Render-Blueprint enthält CSP, HSTS, Clickjacking-, MIME- und Referrer-Schutz; zusätzlich existiert eine Browser-CSP als Fallback.
- PWA besitzt eine separate maskierbare Icon-Variante und einen versionierten Offline-Cache (`finanzplan-v2.2.3`).
