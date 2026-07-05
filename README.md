# Ahnsen hilft

WhatsApp-Dorfassistent und Verwaltungs-Dashboard für Mängelmeldungen,
Veranstaltungen und DGH-Buchungsanfragen.

Der aktuelle Funktionsstand, die Fachregeln und die nächsten Ausbauschritte
stehen in [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Lokaler Start

1. Python 3.11 installieren.
2. Abhängigkeiten installieren: `pip install -r requirements.txt`
3. Die Variablen aus `.env.example` sicher setzen.
4. Anwendung starten:
   `uvicorn main:app --host 0.0.0.0 --port 10000`

Das Dashboard ist anschließend unter `/dashboard` erreichbar. Zugangsdaten,
Tokens und Passwörter dürfen nicht in Git gespeichert werden.
