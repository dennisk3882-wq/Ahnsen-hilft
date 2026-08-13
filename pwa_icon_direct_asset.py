"""Complete Ahnsen launcher artwork from repository text parts."""
from pathlib import Path

_ASSET_DIR = Path(__file__).resolve().parent / "pwa_icon_assets"
_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~"
_VALUES = {char: index for index, char in enumerate(_ALPHABET)}


def _unpack(text: str) -> bytes:
    text = "".join(text.split())
    padding = (-len(text)) % 5
    if padding:
        text += "~" * padding
    result = bytearray()
    for offset in range(0, len(text), 5):
        value = 0
        for char in text[offset:offset + 5]:
            value = value * 85 + _VALUES[char]
        result.extend(value.to_bytes(4, "big"))
    if padding:
        del result[-padding:]
    return bytes(result)


_parts = [
    (_ASSET_DIR / "photo_v7_00.b85").read_text(encoding="ascii"),
    (_ASSET_DIR / "photo_v7_01.b85").read_text(encoding="ascii"),
    (_ASSET_DIR / "photo_v7_02.b85").read_text(encoding="ascii"),
]
STONE_ICON_BYTES = _unpack("".join(_parts))
