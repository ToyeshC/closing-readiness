# Consult&Co Financial Readiness Tool

Financial data quality gate for Dutch SME closing. Ingests bookkeeping data from the Exact Online API (or local Excel/PDF files as fallback), runs deterministic checks, and gates AI advisory behind a readiness score.

**Responsible AI principle:** Claude is never called on dirty data. The harness engine is the gatekeeper.

## Architecture

```
Exact Online API  ──or──  00 Dataroom hackathon/ (local files, dev fallback)
                          demo_seed/tax_pdfs/    (tax-filing PDFs, committed)
        │
        ▼
backend/services/data_loader.py     load_all_from_exact() or load_all() → FinancialDataset
        │
        ▼
backend/services/readiness_engine.py  10 checks + financial ratios → DataReadinessReport
        │ wrapped in @langwatch.trace("readiness_engine")
        │
        ├─ advice_ready=False → call_claude_guided()   (explains what to fix)
        └─ advice_ready=True  → call_claude()          (FACT/ASSUMPTION/ADVICE)
        │   both wrapped in @langwatch.trace, both via direct Anthropic SDK
        ▼
backend_FastAPI_emma/   FastAPI routes (auth, analyze, sources)
        │
        ▼
frontend/               Next.js 16 + Tailwind v4 (brand: navy/cream/rose)
```

## Checks

| Check | Severity | Trigger |
|---|---|---|
| Suspense account balance | blocker | Any GL entry on account 1250 |
| Revenue reconciliation | high | GL 8xxx ≠ sales entries total by >1% |
| CapEx/OpEx misclassification | medium | Asset keywords in 4xxx accounts >€1,000 |
| Bank statement coverage | medium | <90% of business days covered (intersected with bdays) |
| AR aging | medium | Open receivables >90 days old (matched on gross, incl. VAT) |
| Timing differences | medium | GL `Periode` ≠ `boekdatum` month |
| VAT reconciliation | medium | GL VAT ≠ filed return total by >1% |
| CIT preliminary deviation | medium | Provisional CIT ≠ final assessment by >10% OR >€5,000 |
| VAT provisional corrections | medium | Multiple VAT payments for same quarter in tax schedule |
| AP aging | medium | Open payables >90 days old (matched on gross, incl. VAT) |

## Running locally

```bash
# 1. Python deps (anthropic + langwatch + pinned versions)
pip install -r requirements.txt

# 2. Frontend deps
cd frontend && npm install && cd ..

# 3. Copy env template, paste real keys into .env
cp .env.example .env
# Then edit .env: ANTHROPIC_API_KEY, LANGWATCH_API_KEY, EXACT_CLIENT_SECRET

# 4. Run tests (23 should pass)
pytest tests/test_integration.py -v

# 5. Engine smoke on local data
python3 scripts/smoke_test.py --start 2024-01-01 --end 2024-12-31

# 6. Engine smoke on live Exact Online (requires OAuth flow first)
python3 engine_test.py --start 2024-01-01 --end 2024-12-31

# 7. Full stack
# Terminal 1 — backend (single worker; the source-lines endpoint reads module state)
uvicorn backend_FastAPI_emma.main:app --host 127.0.0.1 --port 8000 --reload --workers 1

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — ngrok for OAuth dev (must bind to 127.0.0.1, NOT localhost)
ngrok http --domain=unwired-sweep-apostle.ngrok-free.dev 127.0.0.1:8000

# Open http://localhost:3000
```

The OAuth flow lives at `/auth/exact/redirect`. After consent, Exact Online calls back to `/auth/exact/callback?state=<csrf>&code=<auth>`; the backend verifies the state cookie, exchanges the code, stores tokens in `oauth_tokens.db` (or Railway's `/data/oauth_tokens.db`), and redirects the browser to `FRONTEND_URL`.

## Data sources

- **Primary:** Exact Online REST API via OAuth — division ID 4453885 for the demo tenant.
- **Tax-filing PDFs:** `demo_seed/tax_pdfs/` (committed; ships with the deploy). Path configurable via `TAX_PDF_DIR` env var. Three checks (`vat_reconciliation`, `cit_preliminary_deviation`, `vat_provisional_correction`) read these because Exact Online doesn't expose filed-return amounts.
- **Offline dev fallback:** `00 Dataroom hackathon/` (gitignored client data). Used by `load_all()` when no OAuth token is present.

## Demo numbers (FY2024)

Approximate, recomputed each run:

| Metric | Value |
|---|---|
| Score | ~40% |
| Advice ready | False (suspense €39,893 blocker) |
| DSO | ~8 days (clean book; old code reported 47 due to ex-VAT matching bug) |
| DPO | ~12 days |
| Revenue | ~€921K |
| Gross margin | — (COGS lives in Exact Online, populates there) |

## Deploy

Two scripts. Both read secrets from `.env` and never echo them.

### Backend → Railway

```bash
# One-time setup
brew install railway   # or curl -fsSL https://railway.app/install.sh | sh
railway login
railway init --name consult-co-readiness   # or `railway link --project <id>` if it exists

# Deploy (idempotent — safe to re-run)
bash scripts/deploy_railway.sh
```

After the first deploy, mount a Volume at `/data` in the Railway dashboard (Settings → Volumes → Add Volume, mount path `/data`, 1 GB). This is required so OAuth tokens survive container restarts. Railway's CLI doesn't expose volume mounting yet, so this step is manual.

Then register the Railway domain in Exact Online's developer portal as an allowed redirect URI, update `.env` with the new `EXACT_REDIRECT_URI` and `NEXT_PUBLIC_API_URL`, and re-run `scripts/deploy_railway.sh`.

### Frontend → Vercel

```bash
# One-time setup
npm i -g vercel
cd frontend && vercel login && cd ..

# Deploy (reads NEXT_PUBLIC_API_URL from root .env)
bash scripts/deploy_vercel.sh
```

After Vercel prints its domain, add it to `.env` as `FRONTEND_URL=https://<vercel-domain>` and re-run `scripts/deploy_railway.sh` so the backend's CORS + OAuth post-callback redirect pick it up.

### Env vars Railway needs

The deploy script sets these from `.env`:

| Variable | Source | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` | Set by user |
| `ANTHROPIC_MODEL` | `.env` (defaults to `claude-sonnet-4-6`) | Override if needed |
| `LANGWATCH_API_KEY` | `.env` | Set by user |
| `EXACT_CLIENT_ID` | hardcoded in script | Public identifier |
| `EXACT_CLIENT_SECRET` | `.env` | Set by user |
| `EXACT_REDIRECT_URI` | `.env` | Set after first Railway deploy |
| `FRONTEND_URL` | `.env` | Set after Vercel deploy |
| `TOKEN_DB_PATH` | hardcoded `/data/oauth_tokens.db` | Requires Volume at `/data` |
| `TAX_PDF_DIR` | hardcoded `demo_seed/tax_pdfs` | Already in repo |
| `DATA_FOLDER` | hardcoded `00 Dataroom hackathon` | Only relevant if Exact Online is down |

## Ownership

Toyesh owns the full stack. Emma scaffolded the FastAPI routes and Next.js frontend on Day 5 and handed off; see `EMMA_FRONTEND_HANDOFF.md` for what's done and what's deferred. `backend/models.py` remains the shared contract.

## Known issues / deferred

The full deferred punch list (~30 items: engine, OAuth, frontend, infra) is at the bottom of `/Users/toyesh/.claude/plans/now-based-on-these-witty-wall.md`. Highlights:

- **AR/AP matching is order-dependent** — works on the demo dataset, would need proper bipartite matching for production.
- **`_last_report` is per-worker** — backend runs with `--workers 1`; multi-worker deploys would 404 on `/readiness/{check_id}/sources` calls that hit a different worker than the POST.
- **Dutch SME benchmarks in the system prompt are LLM-generated** — would need a vetted reference table for production.
- **localStorage caps at ~5 MB** — frontend stores the full report there; would need server-side caching for real datasets.
- **CIT/VAT regexes assume comma decimals** — fail silently on whole-euro PDFs.

## Hackathon

Consult&Co internal hackathon, 11–15 May 2026. Demo: 15 May at 15:00.
