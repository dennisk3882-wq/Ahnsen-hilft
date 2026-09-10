"""Capabilities allow providers to receive only server-approved public text."""
import hashlib
import hmac
import json
import os
import time
from html.parser import HTMLParser


def _secret():
    return (os.getenv("PWA_SESSION_SECRET") or os.getenv("DASHBOARD_SESSION_SECRET") or "").encode()


def _signature(value, expires):
    return hmac.new(_secret(), (str(expires) + ":" + value).encode(), hashlib.sha256).hexdigest()


class PublicText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.values = set()
        self.blocked = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        blocked = bool(self.blocked and self.blocked[-1]) or tag in {"script", "style", "textarea", "input", "code", "pre", "svg"} or data.get("translate") == "no" or "data-no-translate" in data
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.blocked.append(blocked)
        if not blocked:
            for key in ("title", "aria-label", "placeholder"):
                self.add(data.get(key, ""))

    def handle_endtag(self, tag):
        if self.blocked:
            self.blocked.pop()

    def handle_data(self, data):
        if not self.blocked or not self.blocked[-1]:
            self.add(data)

    def add(self, value):
        value = value.strip()
        if 2 <= len(value) <= 12000:
            self.values.add(value)


def public_capabilities(html):
    if not _secret():
        return {}
    parser = PublicText()
    parser.feed(html)
    expires = int(time.time()) + 3600
    return {value: f"{expires}.{_signature(value, expires)}" for value in parser.values}


def valid_capability(value, token):
    if not _secret() or not isinstance(value, str) or not isinstance(token, str):
        return False
    try:
        expires, signature = token.split(".", 1)
        return int(time.time()) <= int(expires) <= int(time.time()) + 3700 and hmac.compare_digest(signature, _signature(value, expires))
    except (ValueError, TypeError):
        return False
