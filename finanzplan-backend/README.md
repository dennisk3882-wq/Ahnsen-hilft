# Finanzplan API v3.1

Optionaler Node/Express-Service für N26/Enable Banking, Cloud-KI und Web Push. Der lokale Finanzplan funktioniert ohne diesen Service.

## Render

- Runtime: Node
- Root Directory: `finanzplan-backend`
- Build: `npm install`
- Start: `npm start`
- Health Check: `/health`
- Free Plan ist für private Nutzung vorgesehen; ein Kaltstart nach Inaktivität ist möglich.

`render.yaml` enthält die nicht-geheimen Grundeinstellungen. Folgende Werte müssen im Render-Dashboard als Environment Variables/Secrets gesetzt werden:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_EMAILS`
- `ENABLE_BANKING_APP_ID`
- `ENABLE_BANKING_PRIVATE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- optional `OPENAI_API_KEY`

`STATE_SECRET` und `CRON_SECRET` können bei Blueprint-Erstellung automatisch erzeugt werden.

## Supabase

Für einen Neuaufbau zuerst `supabase/schema.sql`, danach `supabase/002-rpc-hardening.sql` ausführen. Die produktive Instanz wurde bereits mit dem entsprechenden gehärteten Schema eingerichtet.

## VAPID

Lokal ein Schlüsselpaar erzeugen:

```bash
npm install
npm run generate:vapid
```

Private Keys niemals in Git committen.
