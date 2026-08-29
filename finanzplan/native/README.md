# Finanzplan Native Wrapper (V3.2 Vorbereitung)

Die produktive Anwendung bleibt eine local-first PWA. Dieses Verzeichnis bereitet eine optionale Capacitor-Hülle für Android/iOS vor, ohne die Web-PWA davon abhängig zu machen.

## Ziel

- gleiche Finanzengine wie die PWA
- App-Store-Verteilung ohne doppelte Fachlogik
- native Biometrie/Passkey, Share-Sheet und Datei-Handling später ergänzbar
- N26/PSD2 bleibt über das sichere Backend/Consent-Verfahren angebunden; keine Bank-Secrets im Client

## Noch extern erforderlich

Für echte Store-Releases werden Entwicklerkonten, Signatur-/Provisioning-Daten und die jeweiligen Store-Prüfungen benötigt. Diese Zugangsdaten gehören nicht ins Repository.
