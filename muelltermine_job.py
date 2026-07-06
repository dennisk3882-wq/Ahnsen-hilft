from datetime import datetime
from zoneinfo import ZoneInfo

from muelltermine_crud import init_muelltermine_db
from muelltermine_erinnerungen import versende_muell_erinnerungen


def main():
    berlin = ZoneInfo("Europe/Berlin")
    jetzt = datetime.now(berlin)

    if jetzt.hour != 18:
        print(
            "Kein Versand: In Deutschland ist es "
            f"{jetzt.strftime('%H:%M Uhr')}."
        )
        return

    init_muelltermine_db()
    ergebnis = versende_muell_erinnerungen(zeitpunkt=jetzt)

    print(
        "Müllabfuhr-Erinnerungen:",
        f"Abonnements={ergebnis['abonnements']},",
        f"versendet={ergebnis['versendet']},",
        f"übersprungen={ergebnis['uebersprungen']},",
        f"fehlgeschlagen={ergebnis['fehlgeschlagen']}",
    )


if __name__ == "__main__":
    main()
