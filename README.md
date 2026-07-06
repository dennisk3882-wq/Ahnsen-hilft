# Ahnsen hilft

WhatsApp-Dorfassistent und Verwaltungs-Dashboard für Mängelmeldungen,
Veranstaltungen, DGH-Buchungsanfragen und Müllabfuhrtermine.

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

Im Bereich „Müllabfuhr Termine“ kann jährlich der persönliche
AWS-Abfuhrkalender für Ahnsen als PDF importiert werden. Das System erkennt
Datum, Wochentag, Abfuhrarten und Feiertagsverschiebungen automatisch.

## WhatsApp-Müllabfuhr-Erinnerung

Abonnenten erhalten am Vortag einer Abholung um 18:00 Uhr eine
WhatsApp-Erinnerung. Der Versand läuft über den Render-Cron-Job
`ahnsen-muell-erinnerungen`. Dieser Zeitauftrag verwendet bei Render den
kostenpflichtigen Starter-Tarif und verursacht mindestens 1 US-Dollar
monatliche Kosten.

Für Nachrichten außerhalb des 24-Stunden-Fensters muss in WhatsApp Manager
eine deutsche Utility-Vorlage mit dem Namen `muellabfuhr_erinnerung`
freigegeben werden. Der Text besitzt genau zwei Variablen:

```text
🗑️ Müllabfuhr-Erinnerung

Morgen, am {{1}}, wird in Ahnsen folgendes abgeholt:
{{2}}

Bitte stelle die Tonnen rechtzeitig bereit.
```

Der Vorlagenname und die Sprache können bei Bedarf über
`WHATSAPP_MUELL_TEMPLATE` und `WHATSAPP_TEMPLATE_LANGUAGE` geändert werden.
