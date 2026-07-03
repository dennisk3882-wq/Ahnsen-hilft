# state.py

# Hier werden die Benutzerzustände gespeichert.
# Später kann das problemlos durch eine Datenbank ersetzt werden.

user_states = {}


def get_state(sender):
    """Status eines Benutzers abrufen."""
    if sender not in user_states:
        user_states[sender] = {
            "step": "menu",
            "data": {}
        }
    return user_states[sender]


def save_state(sender, state):
    """Status speichern."""
    user_states[sender] = state


def reset_state(sender):
    """Benutzer wieder ins Hauptmenü setzen."""
    user_states[sender] = {
        "step": "menu",
        "data": {}
    }
