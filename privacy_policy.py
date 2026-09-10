"""Conservative browser boundaries shared by every route layer."""
from urllib.parse import urlsplit


PUBLIC_ASSET_PATHS = frozenset({
    "/pwa.css", "/pwa-extra.css", "/community.css", "/warning.css",
    "/accessibility.css", "/header-controls.css", "/compliance.css",
    "/accessibility.js", "/pwa.js", "/community.js",
    "/pwa/icon-192.png", "/pwa/icon-512.png",
})


def is_public_asset(path: str) -> bool:
    return urlsplit(path).path in PUBLIC_ASSET_PATHS


def browser_headers(path: str) -> dict[str, str]:
    headers = {"X-Frame-Options": "DENY"}
    # Even a public page can contain a signed-in citizen's name or selections.
    # Only reviewed, fixed assets are reusable across accounts.
    if not is_public_asset(path):
        headers.update({"Cache-Control": "private, no-store", "Pragma": "no-cache"})
    return headers
