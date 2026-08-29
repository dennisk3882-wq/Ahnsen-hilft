# Finanzplan V3.2 – Automation & Intelligence

## Status der zehn Ausbaupunkte

| # | Bereich | Status |
|---|---|---|
| 1 | N26 Live-Banking | 🟠 Software komplett, externer Enable-Banking-Zugang + N26-Consent nötig |
| 2 | Händlernormalisierung & lernende Kategorien | ✅ fertig |
| 3 | Automatische Vertragserkennung | ✅ fertig |
| 4 | Kündigungsassistent | ✅ fertig |
| 5 | KI-Finanzassistent | ✅ lokaler Analyst erweitert; 🟠 generative Cloud-KI optional extern |
| 6 | Cloud-Ende-zu-Ende-Verschlüsselung | ✅ implementiert und optional aktivierbar |
| 7 | Produktionsmonitoring | ✅ fertig |
| 8 | UX-/Einrichtungscenter | ✅ fertig |
| 9 | Audit-/Security-Härtung | ✅ automatisierte/interne Prüfungen; externer Pen-Test/WCAG-Screenreader-Audit bleibt extern |
| 10 | Weitere Banken / Native Readiness | ✅ Architektur/Capacitor vorbereitet; reale weitere Provider/Stores bleiben extern |

## Supabase

- Row Level Security aktiv
- Security Advisor ohne Security-Lints
- RLS-Performance-Warnungen bereinigt
- fehlende FK-Indizes ergänzt
- Monitoringtabelle mit RLS aktiv
- privater Dokument-Bucket aktiv
- Server-Secret-Store im privaten Schema
- Push-Dispatcher token-geschützt
- anonymer Dispatcher-Aufruf: HTTP 401
- interner Cron-Aufruf: HTTP 200
- Push-Cron: alle 5 Minuten

## Datenhoheit

Finanzplan bleibt local-first. Cloud-E2EE ist bewusst optional: Nach Aktivierung werden Finanzdatensatz-Payloads und Belegdateien vor der Übertragung clientseitig mit AES-GCM verschlüsselt. Die Haushalts-Passphrase wird nicht an Supabase übertragen.

## Externe Restpunkte

1. Enable Banking: App-ID/privater Provider-Key + N26-Consent.
2. Generative Cloud-KI: optionaler Modell/API-Key.
3. Nur bei öffentlicher Vermarktung: externer Penetrationstest, manueller WCAG-2.2-AA-/Screenreader-Audit, Store-Developer-Konten und Providerfreigaben für zusätzliche Banken.
