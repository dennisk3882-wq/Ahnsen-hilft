# PantryPilot – isolierter Deploy-Branch

Dieser Branch enthält ausschließlich das PantryPilot-Deployment. Der `main`-Branch von Ahnsen Digital wird dadurch nicht verändert.

## Enthalten

PantryPilot ist eine installierbare PWA mit Vorratsverwaltung, MHD- und Öffnungswarnungen, Barcode-/GS1-Erkennung, Open-Food-Facts-Abfrage, KI-gestützter Produktfotoanalyse, KI-Rezepten, „Rette mein Essen“, automatischem Mengenabzug beim Kochen, Resteverwaltung, Einkaufsliste, Verbrauchsstatistik, Familien-/Mehrgeräte-Synchronisierung, Offline-Modus und Web-Push.

Der vollständige Produktionsstand liegt aus technischen Gründen des verbundenen GitHub-Connectors in `_deploy/PantryPilot-Production.zip.part00` bis `part08`. Der Render-Build setzt diese Teile wieder zu einem ZIP zusammen und entpackt die Anwendung automatisch.

## Datenschutz / Geheimnisse

Es befinden sich keine API-Schlüssel, PINs oder Haushaltsdaten im Repository. Pantry-Daten liegen zur Laufzeit in SQLite auf dem persistenten Render-Datenträger. `OPENAI_API_KEY` wird ausschließlich als Render-Umgebungsvariable gesetzt.

## Render

Die Blueprint-Konfiguration steht in `render.yaml`. Vorgesehen sind Frankfurt, Node.js, Starter-Webservice, 1-GB-Persistent-Disk und `/api/health` als Health Check.

Für echte Vision-/Rezept-KI muss bei der ersten Render-Einrichtung nur noch `OPENAI_API_KEY` als geheime Umgebungsvariable hinterlegt werden. Ohne Schlüssel funktionieren lokale Bestands-, Warn-, Koch-, Einkaufs- und Offline-Funktionen weiter; die KI-Endpunkte fallen auf die lokalen Logiken zurück.
