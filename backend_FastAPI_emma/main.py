import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend_FastAPI_emma.routers import analyze

app = FastAPI(title="Fietsatelier Morgenwind — Closing Readiness API")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://your-vercel-url.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
