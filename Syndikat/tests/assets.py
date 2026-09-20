"""Decode every raster image; HTTP success does not prove image integrity."""
from pathlib import Path
from PIL import Image
import struct
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1] / 'assets'
errors = []
for path in sorted(root.iterdir()):
    try:
        if path.suffix == '.svg':
            ET.parse(path)
        elif path.suffix.lower() in {'.webp', '.png', '.jpg', '.jpeg'}:
            if path.suffix == '.webp':
                data = path.read_bytes()
                assert len(data) == struct.unpack('<I', data[4:8])[0] + 8, 'truncated RIFF payload'
            with Image.open(path) as image:
                image.load()
                assert image.width > 0 and image.height > 0
    except Exception as error:
        errors.append(f'{path.name}: {error}')
if errors:
    raise SystemExit('\n'.join(errors))
print('All game images decode successfully.')
