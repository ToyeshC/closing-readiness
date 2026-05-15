"""
Exact Online OAuth2 router.

Endpoints:
    GET /auth/exact/redirect  — starts the OAuth flow (sets state cookie, redirects to Exact Online)
    GET /auth/exact/callback  — receives the auth code, verifies state, exchanges code, stores tokens
    GET /auth/exact/status    — connection status check (for frontend Connect button)

CSRF protection: /redirect sets an HttpOnly state cookie and includes the same value
in the OAuth authorize URL. /callback rejects any request whose state query param
doesn't match the cookie. Without this, anyone who can reach the public callback URL
could overwrite the single-row token store with their own Exact Online credentials.
"""
import logging
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from backend.services.token_store import (
    EXACT_AUTH_URL,
    EXACT_ME_URL,
    EXACT_TOKEN_URL,
    store_tokens,
    is_authenticated,
    get_division_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/exact", tags=["auth"])

_STATE_COOKIE = "exact_oauth_state"
_STATE_TTL_SECONDS = 600  # OAuth flows complete within minutes; reject anything older


@router.get("/redirect")
async def redirect_to_exact(response: Response):
    """Redirect the browser to Exact Online's authorization page with CSRF state."""
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": os.environ["EXACT_CLIENT_ID"],
        "redirect_uri": os.environ["EXACT_REDIRECT_URI"],
        "response_type": "code",
        "force_login": "0",
        "state": state,
    }
    redirect = RedirectResponse(url=f"{EXACT_AUTH_URL}?{urlencode(params)}")
    # secure=False locally (HTTP via ngrok dev), secure=True in production.
    # FRONTEND_URL hint: if it starts with https, we're in production.
    is_https = os.environ.get("FRONTEND_URL", "").startswith("https://")
    redirect.set_cookie(
        key=_STATE_COOKIE,
        value=state,
        max_age=_STATE_TTL_SECONDS,
        httponly=True,
        secure=is_https,
        samesite="lax",  # OAuth redirect is a top-level navigation; lax allows the cookie back
    )
    return redirect


@router.get("/callback")
async def oauth_callback(request: Request, code: str, state: str | None = None):
    """
    Exact Online redirects here after the user approves access.
    Verifies CSRF state, exchanges the auth code for tokens, fetches the division_id.
    """
    cookie_state = request.cookies.get(_STATE_COOKIE)
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        # Reject unsolicited callbacks. Without this, anyone with the URL could
        # overwrite the single-row token store with their own tenant's tokens.
        raise HTTPException(
            status_code=400,
            detail="Invalid OAuth state — start the flow from /auth/exact/redirect.",
        )

    async with httpx.AsyncClient() as client:
        # Exchange authorization code for access + refresh tokens
        token_resp = await client.post(EXACT_TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": os.environ["EXACT_REDIRECT_URI"],
            "client_id": os.environ["EXACT_CLIENT_ID"],
            "client_secret": os.environ["EXACT_CLIENT_SECRET"],
        })
        if token_resp.status_code != 200:
            # Don't echo response body back to the client — it may contain the
            # authorization code, client_id, or redirect URI in error payloads
            # which would then appear in browser network logs and reverse-proxy logs.
            logger.error(
                "Exact Online token exchange failed: status=%d body=%s",
                token_resp.status_code, token_resp.text,
            )
            raise HTTPException(
                status_code=502,
                detail=f"OAuth exchange failed (status {token_resp.status_code})",
            )
        tokens = token_resp.json()

        # Fetch the division_id for this account
        me_resp = await client.get(
            f"{EXACT_ME_URL}?$select=CurrentDivision",
            headers={
                "Authorization": f"Bearer {tokens['access_token']}",
                "Accept": "application/json",
            },
        )
        if me_resp.status_code != 200:
            logger.error(
                "Exact Online Me lookup failed: status=%d body=%s",
                me_resp.status_code, me_resp.text,
            )
            raise HTTPException(
                status_code=502,
                detail=f"Could not fetch division (status {me_resp.status_code})",
            )

    me_data = me_resp.json()
    # Handle both /current/Me response shapes Exact Online may return
    results = me_data.get("d", {}).get("results", [])
    division_id = (
        results[0].get("CurrentDivision") if results
        else me_data.get("d", {}).get("CurrentDivision")
    )
    if division_id is None:
        raise HTTPException(
            status_code=502,
            detail="Exact Online did not return a CurrentDivision. Check API permissions.",
        )

    try:
        division_id_int = int(division_id)
    except (TypeError, ValueError):
        logger.error("Exact Online returned non-numeric CurrentDivision: %r", division_id)
        raise HTTPException(status_code=502, detail="Invalid CurrentDivision returned by Exact Online.")

    store_tokens(
        tokens["access_token"],
        tokens["refresh_token"],
        tokens["expires_in"],
        division_id_int,
    )

    # Redirect back to the frontend after successful OAuth — token is now stored locally.
    # ?fresh=1 tells the frontend to clear any stale analysis_result from localStorage
    # so the user starts from the Overview (date picker) rather than seeing a stale report.
    # Also clear the consumed state cookie.
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    redirect = RedirectResponse(url=f"{frontend_url}/?fresh=1")
    redirect.delete_cookie(key=_STATE_COOKIE)
    return redirect


@router.get("/status")
async def auth_status():
    """Returns connection status. Frontend uses this to show Connect/Disconnect button."""
    return {
        "authenticated": is_authenticated(),
        "division_id": get_division_id(),
    }
