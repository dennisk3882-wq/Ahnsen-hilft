# Finanzplan V3.2 – Automation & Intelligence

## Schwerpunkt

V3.2 erweitert V3.1 nicht primär um weitere Menüpunkte, sondern automatisiert den täglichen Datenfluss und härtet Multiuser/Cloud-Betrieb.

### Neu

- kanonische Händlernormalisierung und lernende Kategoriezuordnung
- automatische Erkennung wiederkehrender Vertragsabbuchungen
- Kündigungsassistent mit Text, PDF, E-Mail-Vorbereitung, Versandstatus und Nachweisen
- providerneutraler Banking-Hub; N26 bleibt erster vorbereiteter PSD2-Provider
- erweiterter kostenloser lokaler Finanzanalyst
- optionale clientseitige E2EE für Cloud-Finanzdatensätze und Belege
- Multi-Device-E2EE-Guard vor jedem Cloud-Sync
- sanitisierte technische Betriebsüberwachung mit RLS-geschützter Supabase-Tabelle
- zentrales V3.2-Einrichtungscenter
- Capacitor-/Native-Wrapper-Vorbereitung
- exakter V3.2-Live-Deployment-Gate im Produktionsworkflow

### Sicherheitskorrekturen während der V3.2-Entwicklung

- V3.2-Version bleibt nach jeder Speicherung stabil und wird korrekt in IndexedDB/Tresor persistiert.
- Legacy-Klartext-LocalStorage wird nach jeder V3.2-Speicherung erneut entfernt.
- Ein neues Gerät darf einen E2EE-geschützten Haushalt nicht synchronisieren, bevor die Haushalts-Passphrase eingegeben wurde.
- Monitoring überträgt nur sanitisierte technische Fehlermetadaten, keine absichtlichen Finanzinhalte.

## Extern offen

V3.2 kann diese Vorgänge nicht ohne Drittzugang abschließen:

1. N26-Live-Banking: Enable-Banking-App-Zugang/Private-Key und offizieller N26-Consent.
2. Generative Cloud-KI: Modell/API-Key.
3. Unabhängiger Penetrationstest bzw. formale WCAG-Prüfung.
4. Zusätzliche reale Bankprovider und App-Store-Veröffentlichung.

Die lokale Finanz-PWA bleibt ohne diese externen Dienste vollständig nutzbar.
