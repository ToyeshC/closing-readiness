"""
Exact Online OAuth token storage.

Single-row SQLite store — one authenticated company at a time (matches demo use case).
All functions are module-level so Emma can import them directly.
For production swap to PostgreSQL by replacing _get_conn() — the public API stays identical.
"""
import asyncio
import os
import sqlite3
import time
from pathlib import Path

import httpx

# Serialize refresh requests so two concurrent callers don't both try to use
# the same refresh token. Exact Online rotates refresh tokens on each use,
# so the second caller would otherwise fail with an invalid_grant error.
_refresh_lock = asyncio.Lock()

EXACT_BASE = "https://start.exactonline.nl"
EXACT_TOKEN_URL = f"{EXACT_BASE}/api/oauth2/token"
EXACT_AUTH_URL = f"{EXACT_BASE}/api/oauth2/auth"
EXACT_ME_URL = f"{EXACT_BASE}/api/v1/current/Me"


def _get_db_path() -> Path:
    # Called at runtime so TOKEN_DB_PATH env var can be set in tests
    return Path(os.environ.get("TOKEN_DB_PATH", "oauth_tokens.db"))


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tokens (
            id            INTEGER PRIMARY KEY CHECK (id = 1),
            access_token  TEXT    NOT NULL,
            refresh_token TEXT    NOT NULL,
            expires_at    REAL    NOT NULL,
            division_id   INTEGER NOT NULL
        )
    """)
    conn.commit()
    return conn


def store_tokens(
    access_token: str,
    refresh_token: str,
    expires_in: int,
    division_id: int,
) -> None:
    """Upsert the single token row. Called from the OAuth callback."""
    expires_at = time.time() + int(expires_in)
    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO tokens (id, access_token, refresh_token, expires_at, division_id)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                access_token  = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at    = excluded.expires_at,
                division_id   = excluded.division_id
        """, (access_token, refresh_token, expires_at, division_id))


def _read_row() -> sqlite3.Row | None:
    with _get_conn() as conn:
        return conn.execute("SELECT * FROM tokens WHERE id = 1").fetchone()


def is_authenticated() -> bool:
    """True if a refresh token is stored (regardless of access token expiry)."""
    row = _read_row()
    return row is not None and bool(row["refresh_token"])


def get_division_id() -> int | None:
    row = _read_row()
    return int(row["division_id"]) if row else None


async def get_access_token() -> str:
    """
    Returns a valid access token, refreshing automatically if it expires within 60 seconds.
    Raises RuntimeError if not authenticated (call /auth/exact/redirect first).

    Concurrent calls during the refresh window serialize through _refresh_lock —
    only the first one performs the refresh, the rest pick up the freshly stored
    token.
    """
    row = _read_row()
    if not row:
        raise RuntimeError(
            "Not authenticated with Exact Online. "
            "Complete the OAuth flow via GET /auth/exact/redirect."
        )
    if row["expires_at"] - time.time() > 60:
        return row["access_token"]

    async with _refresh_lock:
        # Re-read inside the lock — the previous holder may have just refreshed.
        row = _read_row()
        if row and row["expires_at"] - time.time() > 60:
            return row["access_token"]

        # Token expired or about to — refresh it
        async with httpx.AsyncClient() as client:
            resp = await client.post(EXACT_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": row["refresh_token"],
                "client_id": os.environ["EXACT_CLIENT_ID"],
                "client_secret": os.environ["EXACT_CLIENT_SECRET"],
            })
            resp.raise_for_status()
            data = resp.json()

        store_tokens(
            data["access_token"],
            data["refresh_token"],
            data["expires_in"],
            int(row["division_id"]),
        )
        return data["access_token"]
