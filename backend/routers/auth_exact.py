"""
Exact Online OAuth2 router.

Emma wires this into main.py with two lines:
    from backend.routers.auth_exact import router as auth_router
    app.include_router(auth_router)

Endpoints:
    GET /auth/exact/redirect  — starts the OAuth flow (redirects to Exact Online)
    GET /auth/exact/callback  — receives the auth code, exchanges it, stores tokens
    GET /auth/exact/status    — connection status check (for frontend Connect button)
"""
import os
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from backend.services.token_store import (
    EXACT_AUTH_URL,
    EXACT_ME_URL,
    EXACT_TOKEN_URL,
    store_tokens,
    is_authenticated,
    get_division_id,
)

router = APIRouter(prefix="/auth/exact", tags=["auth"])


@router.get("/redirect")
async def redirect_to_exact():
    """Redirect the browser to Exact Online's authorization page."""
    params = {
        "client_id": os.environ["EXACT_CLIENT_ID"],
        "redirect_uri": os.environ["EXACT_REDIRECT_URI"],
        "response_type": "code",
        "force_login": "0",
    }
    return RedirectResponse(url=f"{EXACT_AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def oauth_callback(code: str):
    """
    Exact Online redirects here after the user approves access.
    Exchanges the auth code for tokens and fetches the division_id.
    """
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
            raise HTTPException(
                status_code=502,
                detail=f"Exact Online token exchange failed: {token_resp.text}",
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
            raise HTTPException(
                status_code=502,
                detail=f"Could not fetch division from Exact Online: {me_resp.text}",
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

    store_tokens(
        tokens["access_token"],
        tokens["refresh_token"],
        tokens["expires_in"],
        int(division_id),
    )

    # return {"status": "authenticated", "division_id": int(division_id)}
    # Redirect back to the frontend after successful OAuth — token is now stored locally
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    return RedirectResponse(url=frontend_url)


@router.get("/status")
async def auth_status():
    """Returns connection status. Frontend uses this to show Connect/Disconnect button."""
    return {
        "authenticated": is_authenticated(),
        "division_id": get_division_id(),
    }
