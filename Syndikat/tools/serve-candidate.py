"""Serve the candidate with the same index behavior as the released PWA."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = super().translate_path(path)
        if path.endswith('/index.html') or Path(path) == Path.cwd():
            return str(Path.cwd() / 'index-source.html')
        return path
ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('SYNDIKAT_TEST_PORT', '4173'))), Handler).serve_forever()
