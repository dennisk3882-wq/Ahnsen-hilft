from current_events_reminders import dispatch_event_reminders
from pwa_push_job_v2 import run as run_base


def run() -> int:
    try:
        base_delivered = run_base()
    except Exception as error:
        from system_diagnostics import record_system_event
        record_system_event("push_base", "error", type(error).__name__)
        base_delivered = 0
    event_delivered = dispatch_event_reminders()
    if event_delivered:
        print(f"Termin-Erinnerungen: {event_delivered} Push-Zustellung(en).")
    return int(base_delivered or 0) + int(event_delivered or 0)


if __name__ == "__main__":
    run()
