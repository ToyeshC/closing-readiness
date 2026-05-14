#!/usr/bin/env bash
# Deploy the backend to Railway.
#
# Prereqs (one-time):
#   - `brew install railway` (or curl -fsSL https://railway.app/install.sh | sh)
#   - `railway login` (opens browser)
#   - `railway init --name consult-co-readiness` OR `railway link --project <project-id>`
#   - Fill .env with real ANTHROPIC_API_KEY, LANGWATCH_API_KEY, EXACT_CLIENT_SECRET
#
# Usage:
#   bash scripts/deploy_railway.sh
#
# Idempotent — safe to re-run. Reads secrets from .env; never echoes them.

set -euo pipefail
cd "$(dirname "$0")/.."

# ── 0. Sanity checks ────────────────────────────────────────────────────────
command -v railway >/dev/null 2>&1 || {
  echo "ERROR: railway CLI not found. Install: https://docs.railway.app/develop/cli" >&2
  exit 1
}

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real keys first." >&2
  exit 1
fi

# Load .env into the current shell (set -a exports every assignment automatically).
set -a; source .env; set +a

# ── 1. Public env vars (safe to log) ────────────────────────────────────────
echo "Setting public env vars on Railway..."
railway variables --set "ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-sonnet-4-6}"
railway variables --set "EXACT_CLIENT_ID=${EXACT_CLIENT_ID}"
railway variables --set "TOKEN_DB_PATH=/data/oauth_tokens.db"
railway variables --set "TAX_PDF_DIR=demo_seed/tax_pdfs"
railway variables --set "DATA_FOLDER=00 Dataroom hackathon"

# ── 2. Secrets — set without echoing values ─────────────────────────────────
echo "Setting secret env vars on Railway (values not printed)..."
for var in ANTHROPIC_API_KEY LANGWATCH_API_KEY EXACT_CLIENT_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is empty in .env. Paste your key and re-run." >&2
    exit 1
  fi
  railway variables --set "$var=${!var}" > /dev/null
done

# ── 3. Domain-dependent vars (only if known) ────────────────────────────────
if [[ -n "${EXACT_REDIRECT_URI:-}" ]]; then
  railway variables --set "EXACT_REDIRECT_URI=${EXACT_REDIRECT_URI}"
fi
if [[ -n "${FRONTEND_URL:-}" ]]; then
  railway variables --set "FRONTEND_URL=${FRONTEND_URL}"
fi

# ── 4. Deploy ───────────────────────────────────────────────────────────────
echo
echo "Triggering deploy..."
railway up --detach

# ── 5. Show result + next steps ─────────────────────────────────────────────
echo
echo "Deploy submitted. Fetching domain..."
railway domain || true

cat <<'EOF'

Next steps:
  1. If this is the first deploy: in the Railway dashboard, mount a Volume at /data
     (Settings → Volumes → Add Volume, mount path "/data", 1 GB). This is required
     so OAuth tokens survive container restarts. The CLI cannot do this yet.

  2. Note the Railway domain printed above. Then:
     a. In Exact Online developer portal, register
        https://<railway-domain>/auth/exact/callback as an allowed redirect URI.
     b. In .env locally, set:
           EXACT_REDIRECT_URI=https://<railway-domain>/auth/exact/callback
           NEXT_PUBLIC_API_URL=https://<railway-domain>
     c. Re-run this script so Railway picks up the new EXACT_REDIRECT_URI.

  3. Watch logs with `railway logs`.
EOF
