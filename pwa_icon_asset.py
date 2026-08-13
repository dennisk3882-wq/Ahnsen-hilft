"""Ahnsen launcher artwork without stored Base64/Base85 payloads."""
import base64
import hashlib

from pwa_icon_assets.icon_v7_bytes_00 import DATA as _DATA_00
from pwa_icon_assets.icon_v7_bytes_01 import DATA as _DATA_01
from pwa_icon_assets.icon_v7_bytes_02 import DATA as _DATA_02

# Keep the legacy variable names temporarily so the existing renderer can use
# the source without another binary transfer. The repository source itself is
# now stored as direct WebP bytes rather than Base64/Base85 text.
_SOURCE = _DATA_00 + _DATA_01 + _DATA_02
STONE_ICON_JPEG_BASE64 = base64.b64encode(_SOURCE).decode("ascii")
STONE_ICON_SHA256 = hashlib.sha256(_SOURCE).hexdigest()
