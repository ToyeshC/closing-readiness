"""Temporary OAuth test server — do NOT commit. Run with: uvicorn test_server:app --port 8000"""
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from backend.routers.auth_exact import router as auth_router

app = FastAPI(title="OAuth test server")
app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
