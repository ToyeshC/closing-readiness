import os
from dotenv import load_dotenv

# load_dotenv() must run BEFORE any other local imports because reasoning.py
# reads OPENROUTER_API_KEY at module level when the OpenAI client is created.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend_FastAPI_emma.routers import analyze
from backend.routers.auth_exact import router as auth_router

app = FastAPI(title="Fietsatelier Morgenwind — Closing Readiness API")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://your-vercel-url.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1")
app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
