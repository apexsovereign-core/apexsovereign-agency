from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title="ApexSovereign Settlement & Compute Mesh", version="2.0.0")

@app.get("/health", response_class=HTMLResponse)
async def health_check():
    return "OK - ApexSovereign Lead Hunter Daemon Active"

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    html_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<html><body><h3>ApexSovereign Core Initialized</h3><p>Dashboard mounting...</p></body></html>"
