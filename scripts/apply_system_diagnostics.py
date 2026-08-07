from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Replacement marker missing: {label}")
    return text.replace(old, new, 1)


# Navigation: add a dedicated System area and make the mobile dock fit seven entries.
path = "intern_ui.py"
text = read(path)
if '    "system":' not in text:
    marker = '    "app": """<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9 5h6m-4 14h2"/></svg>""",\n'
    icon = '    "system": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-5 4 10 2-5h5"/><circle cx="12" cy="12" r="9"/></svg>""",\n'
    text = require_replace(text, marker, icon + marker, "intern system icon")
if '("system", "/intern/system", "System")' not in text:
    marker = '        ("push", "/intern/push", "Push"),\n'
    text = require_replace(text, marker, marker + '        ("system", "/intern/system", "System"),\n', "intern system nav")
text = text.replace('grid-template-columns:repeat(6, minmax(0,1fr));', 'grid-template-columns:repeat(7, minmax(0,1fr));')
write(path, text)


# Add a real but explicitly-triggered test email helper. It always uses EMAIL_TO.
path = "email_service.py"
text = read(path)
if "def send_test_email(" not in text:
    text += '''\n\n\ndef send_test_email():\n    """Send a neutral diagnostic email only to the configured administration inbox."""\n    msg = EmailMessage()\n    msg["Subject"] = "Ahnsen hilft – Systemtest E-Mail"\n    msg["From"] = EMAIL_USER\n    msg["To"] = EMAIL_TO\n    msg.set_content(\n        f"""Ahnsen hilft Systemtest\n\nDiese Nachricht wurde im Verwaltungsbereich unter System & Diagnose bewusst ausgelöst.\n\nZeit:\n{datetime.now().strftime('%d.%m.%Y %H:%M:%S')}\n\nWenn diese E-Mail angekommen ist, funktionieren SMTP-Anmeldung und Versand.\n"""\n    )\n    _send_message(msg)\n'''
write(path, text)


# Record every hourly cron invocation in the shared diagnostics table.
write(
    "pwa_push_job.py",
    '''from datetime import timedelta\nfrom zoneinfo import ZoneInfo\n\nfrom crud import init_db\nfrom dgh_crud import init_dgh_db\nfrom gemeinde_crud import init_gemeinde_db\nfrom muelltermine_crud import get_naechste_muelltermine, init_muelltermine_db\nfrom pwa_crud import (\n    delivery_already_sent,\n    get_users_with_waste_push,\n    init_pwa_db,\n    mark_delivery_sent,\n)\nfrom push_service import push_configured, send_user_notification\nfrom system_diagnostics import init_system_diagnostics_db, record_system_event\nfrom veranstaltungen_crud import init_veranstaltungen_db\n\n\ndef _record(status: str, message: str, details=None) -> None:\n    try:\n        record_system_event("muell_cron", status, message, details or {})\n    except Exception as error:\n        print("Cron-Status konnte nicht protokolliert werden:", repr(error))\n\n\ndef run() -> int:\n    init_db()\n    init_veranstaltungen_db()\n    init_dgh_db()\n    init_muelltermine_db()\n    init_gemeinde_db()\n    init_pwa_db()\n    init_system_diagnostics_db()\n\n    try:\n        if not push_configured():\n            message = "VAPID-Schlüssel fehlen; Push-Job beendet."\n            _record("error", message)\n            print(message)\n            return 0\n\n        now = __import__("datetime").datetime.now(ZoneInfo("Europe/Berlin"))\n        if now.hour != 18:\n            message = "Stündlicher Kontrolllauf erfolgreich; außerhalb des Erinnerungsfensters."\n            _record("ok", message, {"berlin_hour": now.hour})\n            print("Außerhalb des Erinnerungsfensters; Push-Job beendet.")\n            return 0\n\n        tomorrow = now.date() + timedelta(days=1)\n        terms = [\n            item\n            for item in get_naechste_muelltermine(limit=30)\n            if getattr(item, "datum", None) == tomorrow\n        ]\n        if not terms:\n            message = "18-Uhr-Lauf erfolgreich; morgen ist keine Müllabfuhr eingetragen."\n            _record("ok", message, {"date": tomorrow.isoformat(), "delivered": 0})\n            print("Morgen ist keine Müllabfuhr eingetragen.")\n            return 0\n\n        kinds = ", ".join(\n            sorted({str(getattr(item, "abfuhrarten", "Müllabfuhr")) for item in terms})\n        )\n        delivery_key = f"muell:{tomorrow.isoformat()}:{kinds}"\n        delivered = 0\n\n        for user in get_users_with_waste_push():\n            if delivery_already_sent(user.id, delivery_key):\n                continue\n            sent = send_user_notification(\n                user.id,\n                "Müllabfuhr morgen",\n                f"Morgen wird in Ahnsen abgeholt: {kinds}.",\n                "/muelltermine-info",\n                f"muell-{tomorrow.isoformat()}",\n                "push_muell",\n            )\n            if sent:\n                mark_delivery_sent(user.id, delivery_key)\n                delivered += 1\n\n        message = f"18-Uhr-Lauf erfolgreich; Müllabfuhr-Push an {delivered} Konten versendet."\n        _record(\n            "ok",\n            message,\n            {"date": tomorrow.isoformat(), "kinds": kinds, "delivered": delivered},\n        )\n        print(f"Müllabfuhr-Push an {delivered} Konten versendet.")\n        return delivered\n    except Exception as error:\n        _record("error", f"Cronjob abgebrochen: {type(error).__name__}: {str(error)[:500]}")\n        raise\n\n\nif __name__ == "__main__":\n    run()\n''',
)


# Integrate diagnostics routes into the PWA app.
path = "pwa_core.py"
text = read(path)
text = require_replace(
    text,
    "from email_service import send_dgh_email, send_email\n",
    "from email_service import send_dgh_email, send_email, send_test_email\n",
    "pwa_core email import",
)
if "from system_dashboard import system_dashboard_page" not in text:
    marker = "from push_dashboard import push_dashboard_page\n"
    addition = '''from system_dashboard import system_dashboard_page\nfrom system_diagnostics import (\n    get_push_test_targets,\n    init_system_diagnostics_db,\n    record_system_event,\n    run_system_checks,\n)\n'''
    text = require_replace(text, marker, marker + addition, "pwa_core diagnostics imports")
text = require_replace(
    text,
    "    init_pwa_db()\n\n\ndef _public_data()",
    "    init_pwa_db()\n    init_system_diagnostics_db()\n\n\ndef _public_data()",
    "pwa_core diagnostics startup",
)
if '@app.get("/intern/system")' not in text:
    marker = '@app.get("/pwa.css")\nasync def pwa_css():\n'
    routes = '''@app.get("/intern/system")\nasync def admin_system_page(request: Request, voll: int = 0, hinweis: str = "", fehler: str = ""):\n    legacy.check_dashboard_login(request)\n    report = run_system_checks(app, request=request, deep=bool(voll))\n    return system_dashboard_page(\n        report,\n        get_push_test_targets(),\n        hinweis=hinweis,\n        fehler=fehler,\n    )\n\n\n@app.post("/intern/system/test-push")\nasync def admin_system_test_push(request: Request):\n    legacy.check_dashboard_login(request)\n    form = await request.form()\n    try:\n        user_id = int(str(form.get("user_id") or "0"))\n    except ValueError:\n        user_id = 0\n    user = get_user_by_id(user_id)\n    if not user:\n        return RedirectResponse(url="/intern/system?fehler=Ungültiges%20Push-Zielkonto.", status_code=303)\n    sent = send_user_notification(\n        user.id,\n        "Ahnsen hilft – Test-Push",\n        "Systemtest erfolgreich: Push-Nachrichten erreichen dieses Gerät.",\n        "/profil",\n        f"system-test-{int(time.time())}",\n    )\n    if sent:\n        try:\n            record_system_event(\n                "test_push",\n                "ok",\n                f"Test-Push an {user.email} auf {sent} Gerät(e) versendet.",\n                {"user_id": user.id, "devices": sent},\n            )\n        except Exception:\n            pass\n        return RedirectResponse(\n            url=f"/intern/system?hinweis={quote(f'Test-Push wurde an {sent} Gerät(e) des ausgewählten Kontos versendet.')}",\n            status_code=303,\n        )\n    try:\n        record_system_event(\n            "test_push",\n            "error",\n            f"Test-Push an {user.email} konnte an kein Gerät zugestellt werden.",\n            {"user_id": user.id},\n        )\n    except Exception:\n        pass\n    return RedirectResponse(\n        url="/intern/system?fehler=Test-Push%20konnte%20an%20kein%20registriertes%20Gerät%20zugestellt%20werden.",\n        status_code=303,\n    )\n\n\n@app.post("/intern/system/test-email")\nasync def admin_system_test_email(request: Request):\n    legacy.check_dashboard_login(request)\n    try:\n        send_test_email()\n        try:\n            record_system_event("test_email", "ok", "Test-E-Mail wurde erfolgreich an EMAIL_TO versendet.")\n        except Exception:\n            pass\n        return RedirectResponse(\n            url="/intern/system?hinweis=Test-E-Mail%20wurde%20erfolgreich%20an%20die%20konfigurierte%20Verwaltungsadresse%20versendet.",\n            status_code=303,\n        )\n    except Exception as error:\n        try:\n            record_system_event(\n                "test_email",\n                "error",\n                f"Test-E-Mail fehlgeschlagen: {type(error).__name__}: {str(error)[:500]}",\n            )\n        except Exception:\n            pass\n        return RedirectResponse(\n            url=f"/intern/system?fehler={quote('Test-E-Mail fehlgeschlagen: ' + str(error)[:180])}",\n            status_code=303,\n        )\n\n\n'''
    text = require_replace(text, marker, routes + marker, "pwa_core system routes")
write(path, text)


# Extend PWA smoke tests with the live diagnostic engine and new protected routes.
path = ".github/workflows/pwa-smoke.yml"
text = read(path)
text = require_replace(
    text,
    "          from pwa_ui import home_page\n",
    "          from pwa_ui import home_page\n          from system_diagnostics import run_system_checks\n",
    "pwa smoke diagnostics import",
)
text = require_replace(
    text,
    '              "/service-worker.js", "/verwaltung", "/intern/maengel",\n',
    '              "/service-worker.js", "/verwaltung", "/intern/maengel",\n              "/intern/system", "/intern/system/test-push", "/intern/system/test-email",\n',
    "pwa smoke system routes",
)
if "diagnostic_report = run_system_checks" not in text:
    marker = '          assert b"ahnsen-app-v5-512.png" in manifest.body\n\n'
    addition = '''          diagnostic_report = run_system_checks(pwa_main.app, deep=False)\n          assert diagnostic_report["summary"]["error"] == 0, [\n              item for item in diagnostic_report["checks"] if item["status"] == "error"\n          ]\n          diagnostic_keys = {item["key"] for item in diagnostic_report["checks"]}\n          assert {"database", "reports", "dgh", "push", "geolocation", "service_worker", "security"} <= diagnostic_keys\n\n'''
    text = require_replace(text, marker, marker + addition, "pwa smoke diagnostic assertions")
write(path, text)


# Render the new diagnostics page as part of the administration smoke suite.
path = ".github/workflows/admin-smoke.yml"
text = read(path)
text = require_replace(
    text,
    "            gemeinde_dashboard.py\n",
    "            gemeinde_dashboard.py \\\n            system_dashboard.py \\\n            system_diagnostics.py\n",
    "admin smoke compile diagnostics",
)
if "from system_dashboard import system_dashboard_page" not in text:
    marker = "          from pwa_core import startup\n"
    addition = '''          import pwa_main\n          from system_dashboard import system_dashboard_page\n          from system_diagnostics import get_push_test_targets, run_system_checks\n'''
    text = require_replace(text, marker, marker + addition, "admin smoke diagnostics imports")
if '"system": system_dashboard_page' not in text:
    marker = '              "content": gemeinde_dashboard(get_gemeinde_einstellungen()),\n'
    addition = '              "system": system_dashboard_page(run_system_checks(pwa_main.app, deep=False), get_push_test_targets()),\n'
    text = require_replace(text, marker, marker + addition, "admin smoke system page")
if 'assert "System & Diagnose" in pages["system"]' not in text:
    marker = '          assert "WhatsApp-Bot</h2>" not in content_html\n\n'
    addition = '          assert "System & Diagnose" in pages["system"].body.decode("utf-8")\n\n'
    text = require_replace(text, marker, marker + addition, "admin smoke system assertion")
write(path, text)

print("System diagnostics integration applied.")
