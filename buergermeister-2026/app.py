from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
app = FastAPI(title="Bürgermeister 2026")

@app.get('/health')
def health():
    return {"status": "ok"}

@app.get('/')
def index():
    return FileResponse(BASE / 'index.html')

app.mount('/', StaticFiles(directory=BASE, html=True), name='static')
