#!/usr/bin/env bash
# Deploy the frontend to Vercel.
#
# Prereqs (one-time):
#   - `npm i -g vercel`
#   - From frontend/: `vercel login` (opens browser)
#   - Fill .env at repo root with NEXT_PUBLIC_API_URL set to the Railway domain
#     (after the Railway deploy script has run and printed its domain)
#
# Usage:
#   bash scripts/deploy_vercel.sh
#
# Idempotent — safe to re-run.

set -euo pipefail
cd "$(dirname "$0")/../frontend"

# ── 0. Sanity checks ────────────────────────────────────────────────────────
command -v vercel >/dev/null 2>&1 || {
  echo "ERROR: vercel CLI not found. Install: npm i -g vercel" >&2
  exit 1
}

ROOT_ENV="$(dirname "$0")/../.env"
if [[ -f "$ROOT_ENV" ]]; then
  set -a; source "$ROOT_ENV"; set +a
else
  echo "WARN: no .env at repo root — NEXT_PUBLIC_API_URL may need to be set manually" >&2
fi

if [[ -z "${NEXT_PUBLIC_API_URL:-}" ]]; then
  echo "ERROR: NEXT_PUBLIC_API_URL not set in .env." >&2
  echo "       Set it to the Railway backend domain (e.g., https://consult-co.up.railway.app)." >&2
  exit 1
fi

# ── 1. Link the project (interactive only on first run) ─────────────────────
if [[ ! -d .vercel ]]; then
  echo "First-time link: walking through Vercel project creation..."
  vercel link
fi

# ── 2. Set NEXT_PUBLIC_API_URL (idempotent — --force overwrites if exists) ──
echo "Setting NEXT_PUBLIC_API_URL on Vercel..."
echo "$NEXT_PUBLIC_API_URL" | vercel env add NEXT_PUBLIC_API_URL production --force > /dev/null || true
echo "$NEXT_PUBLIC_API_URL" | vercel env add NEXT_PUBLIC_API_URL preview --force > /dev/null || true

# ── 3. Deploy ───────────────────────────────────────────────────────────────
echo
echo "Deploying to production..."
vercel --prod

cat <<'EOF'

Next steps:
  1. Note the Vercel domain printed above.
  2. In .env at repo root, set:
       FRONTEND_URL=https://<vercel-domain>
  3. Re-run scripts/deploy_railway.sh so Railway picks up the new FRONTEND_URL
     (it's used for the OAuth post-callback redirect and CORS).
  4. Open the Vercel URL — click "Connect to Exact Online" → OAuth flow → returns
     to the app with the connected pill visible.
EOF
