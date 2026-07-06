ANZEIGENAMEN = {
    "Bioabfall": "🟤 Biotonne",
    "Leichtverpackungen": "🟡 Gelbe Tonne / Plastik",
    "Restabfall": "⚫ Restmülltonne",
    "Altpapier": "🔵 Papiertonne",
    "Sommerbiotonne": "🌿 Sommerbiotonne",
}


def formatiere_abfuhrarten(abfuhrarten, mit_symbol=True):
    if isinstance(abfuhrarten, str):
        werte = abfuhrarten.split(",")
    else:
        werte = abfuhrarten or []

    namen = []

    for wert in werte:
        wert = str(wert).strip()
        if not wert:
            continue

        name = ANZEIGENAMEN.get(wert, wert)
        if not mit_symbol:
            name = name.split(" ", 1)[-1]
        namen.append(name)

    return namen


def verbinde_aufzaehlung(werte):
    if not werte:
        return ""
    if len(werte) == 1:
        return werte[0]
    return ", ".join(werte[:-1]) + " und " + werte[-1]
