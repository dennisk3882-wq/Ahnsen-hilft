"""Compatibility stubs for the retired WhatsApp transport.

The PWA is the only active citizen channel. These functions remain temporarily
so older database records and administration code can still be imported without
opening a connection to Meta or sending messages.
"""


class DisabledWhatsAppResponse:
    status_code = 410
    text = "WhatsApp transport is disabled; use the Ahnsen hilft PWA."

    @staticmethod
    def json():
        return {"status": "disabled", "channel": "pwa"}


def _disabled(operation):
    print(f"WhatsApp-Funktion deaktiviert: {operation}")
    return DisabledWhatsAppResponse()


def send_whatsapp_message(to, text):
    return _disabled("Textnachricht")


def send_whatsapp_template(to, template_name, language_code, body_parameters):
    return _disabled("Vorlagennachricht")


def upload_whatsapp_media(bild_base64):
    _disabled("Medienupload")
    return None


def send_whatsapp_image(to, bild_base64, caption=""):
    return _disabled("Bildnachricht")
