# Finanzplan V3.1 – Aktivierungsstatus

## Implementiert und lokal nutzbar

- Finanz-Autopilot
- Prognoseband konservativ / Basis / optimistisch
- Anomalie- und Dublettenerkennung
- Vertrags-/Kündigungsprüfung
- automatische Monatsberichte
- Jahresvergleich inkl. optionaler Inflation
- QIF / OFX / MT940 / CAMT.053 Import
- zusätzliche Vermögenswerte / Portfolio
- Passkey-/WebAuthn-Härtung mit Geräte-Fallback
- erweiterte V3.1 Testmatrix

## Cloud vorbereitet/eingerichtet

- Supabase Projekt verbunden
- Auth-Client integriert
- Haushalte, Rollen und Einladungen
- RLS-geschützter datensatzweiser Sync
- optimistische Versionsprüfung / Konflikte
- privater Dokument-Bucket und Beleg-Sync
- Supabase Security Advisor: keine aktuellen Lints nach Hardening

## Externe Aktivierung nach Deployment nötig

- Render `finanzplan-api` Web Service + Backend-Secrets
- Enable Banking Anwendung/Private Key und einmaliger N26-Consent
- VAPID-Schlüsselpaar + Push Dispatcher
- optional OpenAI API Key für Cloud-KI; lokaler Analyst funktioniert ohne Kosten

Keine geheimen Schlüssel gehören in das statische PWA-Repository.
