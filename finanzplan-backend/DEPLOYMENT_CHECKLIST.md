# Deployment checklist

1. Render Web Service from `finanzplan-backend`.
2. Set `SUPABASE_SERVICE_ROLE_KEY` only server-side.
3. Set `ALLOWED_EMAILS` for the private instance.
4. Add Enable Banking credentials when N26 sync is activated.
5. Add VAPID keys when background push is activated.
6. Add an OpenAI API key only if optional Cloud-AI is desired.
7. Verify `/health` before enabling integrations in the PWA.
8. Never expose server secrets in static JavaScript.
