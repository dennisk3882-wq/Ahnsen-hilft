from current_events_reminders import dispatch_event_reminders
from pwa_push_job_v2 import run as run_base


def run() -> int:
    base_delivered = run_base()
    event_delivered = dispatch_event_reminders()
    if event_delivered:
        print(f"Termin-Erinnerungen: {event_delivered} Push-Zustellung(en).")
    return int(base_delivered or 0) + int(event_delivered or 0)


if __name__ == "__main__":
    run()
