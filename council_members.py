from __future__ import annotations


# Öffentliche Übersicht des amtierenden Gemeinderats, Wahlperiode 2021–2026.
# Wohnorte werden bewusst nur auf Ortsebene veröffentlicht. Altersangaben werden
# ausschließlich aufgenommen, wenn sie aktuell und öffentlich belastbar belegt sind.
_CURRENT_COUNCIL = [
    {"name": "Pierre Pohl", "party": "SPD", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Bürgermeister", "note": ""},
    {"name": "Sascha Backhaus", "party": "SPD", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Wolfgang Faulhaber", "party": "SPD", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Ole Grimmig", "party": "SPD", "residence": "Ahnsen", "age": "39 (Stand 04/2026)", "role": "Ratsmitglied", "note": ""},
    {"name": "Hans-Jürgen Kauffeld", "party": "SPD", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Rüdiger Piel", "party": "SPD", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Stefan Schmidt", "party": "SPD · Ratsliste 2021", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": "2026 Mitinitiator der Wählergemeinschaft Wir für Ahnsen (WFA)."},
    {"name": "Carsten Borrmann", "party": "CDU", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Robert Pavlista", "party": "CDU", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
    {"name": "Anne Warnke", "party": "CDU · Ratsliste 2021", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": "2026 Vorsitzende der Wählergemeinschaft Wir für Ahnsen (WFA)."},
    {"name": "Kerstin Zuschlag", "party": "CDU", "residence": "Ahnsen", "age": "nicht öffentlich verifiziert", "role": "Ratsmitglied", "note": ""},
]


def get_current_council_members() -> dict:
    return {
        "term": "2021–2026",
        "verified_at": "09.08.2026",
        "source_label": "Bürgerinfo Samtgemeinde Eilsen / öffentliche Kommunalquellen",
        "members": [dict(item) for item in _CURRENT_COUNCIL],
    }
