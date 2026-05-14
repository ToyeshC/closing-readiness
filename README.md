# Consult&Co Financial Readiness Tool

Financial data quality gate for Dutch SME closing. Ingests raw bookkeeping exports or live Exact Online data, runs deterministic checks, and gates AI advisory behind a readiness score.

**Responsible AI principle:** Claude is never called on dirty data. The harness engine is the gatekeeper.

## Architecture

```
Exact Online API  ──OR──  00 Dataroom hackathon/ (local Excel/PDF files)
        │
        ▼
backend/services/data_loader.py     load_all_from_exact() or load_all() → FinancialDataset
        │
        ▼
backend/services/readiness_engine.py  runs 10 checks + financial ratios → DataReadinessReport
        │
        ├─ advice_ready = False → Claude guided-diagnosis (explains what to fix, not a hard block)
        └─ advice_ready = True  → Claude Sonnet advisory + market comparison
        │
        ▼
backend_FastAPI_emma/               FastAPI routes (Emma)
        │
        ▼
frontend/                           Next.js UI (Emma)
```

## Checks

| Check | Severity | Trigger |
|---|---|---|
| Suspense account balance | blocker | Any GL entry on account 1250 |
| Revenue reconciliation | high | GL 8xxx ≠ sales entries total by >1% |
| CapEx/OpEx misclassification | medium | Asset keywords in 4xxx accounts >€1,000 |
| Bank statement coverage | medium | <90% of business days covered |
| AR aging | medium | Open receivables >90 days old |
| Timing differences | medium | GL `Periode` ≠ `boekdatum` month |
| VAT reconciliation | medium | GL VAT ≠ filed return total by >1% |
| CIT preliminary deviation | medium | Provisional CIT ≠ final assessment by >10% |
| VAT provisional corrections | medium | Multiple VAT payments for same quarter in tax schedule |
| AP aging | medium | Open payables >90 days old |

## Live Results (Exact Online, division 4453885, FY2024)

| Metric | Value |
|---|---|
| Score | 40% |
| Advice ready | False (suspense blocker) |
| DSO | 46.7 days |
| DPO | 365 days (inflated — purchase entries lack due dates in API) |
| Revenue | €1,112,173 |
| Gross margin | 91.8% |

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Copy env template and fill in Exact Online credentials
cp .env.example .env

# OAuth test server (requires ngrok forwarding :8000)
uvicorn test_server:app --port 8000
# Then open http://localhost:8000/auth/exact/redirect in browser

# Run engine on Exact Online data (after OAuth)
python3 engine_test.py

# Run engine on local files
python3 -c "
import asyncio
from pathlib import Path
from datetime import date
from backend.services.data_loader import load_all
from backend.services.readiness_engine import ReadinessEngine

async def main():
    ds = await load_all(Path('00 Dataroom hackathon'), date(2024,1,1), date(2024,12,31))
    report = ReadinessEngine(ds).run()
    print(f'Score: {report.overall_score:.0%} | Advice ready: {report.advice_ready}')
    for c in report.checks:
        fix = f' → fix: {c.score_after_fix:.0%}' if c.score_after_fix else ''
        print(f'  [{c.status.upper():7}] {c.label}{fix}')

asyncio.run(main())
"

# Run tests
pytest tests/test_integration.py -v

# Start FastAPI server (but this may fail on Python <3.10 (Anaconda default))
# uvicorn backend_FastAPI_emma.main:app --reload

# Start FastAPI server (Python 3.11 required — Pydantic v2 uses float|None syntax)
/Library/Frameworks/Python.framework/Versions/3.11/bin/uvicorn backend_FastAPI_emma.main:app --reload
```

## Data

Local files only — not in git. Folder: `00 Dataroom hackathon/` (Fietsatelier Morgenwind BV).

Exact Online API: OAuth credentials in `.env` (gitignored). Division ID: 4453885.

## Team

- **Toyesh** — data engine (`backend/services/`)
- **Emma** — FastAPI routes + Next.js frontend (`backend_FastAPI_emma/`)
- **Shared contract** — `backend/models.py` (coordinate before changing)

## Deploy

### Backend → Railway

```bash
railway login
railway up
```

Set these env vars in the Railway dashboard (Settings → Variables):

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | your OpenRouter key |
| `OPENROUTER_MODEL` | `openai/gpt-oss-120b:free` |
| `LANGWATCH_API_KEY` | your LangWatch key |
| `EXACT_CLIENT_ID` | from Exact Online developer portal |
| `EXACT_CLIENT_SECRET` | from Exact Online developer portal |
| `EXACT_REDIRECT_URI` | `https://<railway-domain>/auth/exact/callback` |
| `FRONTEND_URL` | your Vercel deployment URL |
| `TOKEN_DB_PATH` | `/data/oauth_tokens.db` (add persistent volume at `/data`) |

> `ANTHROPIC_API_KEY` is not needed — LLM calls go through OpenRouter. Keep it commented in `.env.example` for future reference.

### Frontend → Vercel

```bash
cd frontend && vercel --prod
```

Set `NEXT_PUBLIC_API_URL` to the Railway backend URL.

---

## Known Issues / Deferred

- **DPO inflated in Exact Online mode**: `purchaseentry/PurchaseEntries` returns no reliable due dates when data is imported as GL entries. DPO of 365 days is an artefact — AP amounts exist but matching is approximate.
- **SalesInvoices empty in Exact Online**: Data was imported as GL entries, not via Exact Online's sales module. AR lines from `TransactionLines` (account 1300) are used as fallback. AR aging passes but has no due date data.
- **VAT/CIT PDF path**: Checks resolve PDFs relative to `__file__.parents[3]`. Will warn (not crash) if PDFs are absent — correct behaviour in Exact Online mode.
- **Railway deployment**: `POST /readiness` with local files requires `00 Dataroom hackathon/` (gitignored). Override with `DATA_FOLDER=/abs/path`. Exact Online mode works without local files.

## Hackathon

Consult&Co internal hackathon, 11–15 May 2026. Demo: 15 May at 15:00.
