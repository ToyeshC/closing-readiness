# Consult&Co Financial Readiness Tool

Financial data quality gate for Dutch SME closing. Ingests raw bookkeeping exports, runs deterministic checks, and gates AI advisory behind a readiness score.

**Responsible AI principle:** Claude is never called on dirty data. The harness engine is the gatekeeper.

## Architecture

```
00 Dataroom hackathon/   (local only — never commit)
        │
        ▼
backend/services/data_loader.py     loads Excel/CSV/PDF files (or Exact Online API) → FinancialDataset
        │
        ▼
backend/services/readiness_engine.py  runs 11 checks + financial ratios → DataReadinessReport
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
| Unimported file discrepancies | high | Files in `to do/` differ from main |
| Revenue reconciliation | high | GL 8xxx ≠ sales entries total by >1% |
| CapEx/OpEx misclassification | medium | Asset keywords in 4xxx accounts >€1,000 |
| Bank statement coverage | medium | <90% of business days covered |
| AR aging | medium | Open receivables >90 days old |
| Timing differences | medium | GL `Periode` ≠ `boekdatum` month |
| VAT reconciliation | medium | GL VAT ≠ filed return total by >1% |
| CIT preliminary deviation | medium | Provisional CIT ≠ final assessment by >10% |
| VAT provisional corrections | medium | Multiple VAT payments for same quarter in tax schedule |
| AP aging | medium | Open payables >90 days old |

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Run engine smoke test
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
        print(f'  [{c.status.upper():7}] {c.label}')

asyncio.run(main())
"

# Run tests
pytest tests/test_integration.py -v

# Start FastAPI server
uvicorn backend_FastAPI_emma.main:app --reload
```

## Data

Local files only — not in git. Folder: `00 Dataroom hackathon/` (Fietsatelier Morgenwind BV).

## Team

- **Toyesh** — data engine (`backend/services/`)
- **Emma** — FastAPI routes + Next.js frontend (`backend_FastAPI_emma/`)
- **Shared contract** — `backend/models.py` (coordinate before changing)

## Known Issues / Deferred

- **DATA_FOLDER on Railway**: `POST /readiness` requires local data files (`00 Dataroom hackathon/`). These are gitignored (financial client data). Override with `DATA_FOLDER=/abs/path` env var. Railway deployment shows a healthy `/health` endpoint but `POST /readiness` requires the data folder to be present.
- **VAT PDF path**: `vat_reconciliation.py` and `cit_preliminary_deviation.py` resolve PDFs relative to the file's location (`__file__.parents[3]`). Will fail silently if the package is installed outside the repo root.
- **Demo script**: 7-step judge walk-through not yet written.

## Waiting On External Dependencies

- **Exact Online OAuth credentials**: Organiser will provide `client_id` + `client_secret` once redirect URL is registered. Redirect URL ready: `https://unwired-sweep-apostle.ngrok-free.dev/auth/exact/callback`. Once received: wire `load_all_from_exact()` in `data_loader.py` (scaffold already written) and add auth endpoints to Emma's FastAPI.
- **`todo_discrepancy` check redesign**: Current check compares local "to do/" folder files against main folder. Once Exact Online API is live, concept changes entirely — to-do items exist natively in Exact Online. Check needs rethinking post-API.
- **Suspense entry reasons**: Exact Online stores a reason/description on suspense entries. Once API is connected, surface these in `source_lines` panel so users see *why* an entry is in 1250, not just that it is.
- **Emma's frontend**: `AnalysisResult` schema needs `ratios: FinancialRatios` field exposed; 3 new check cards needed (`cit_preliminary_deviation`, `vat_provisional_correction`, `ap_aging_stale`); guided-diagnosis response wiring needed.
- **LangWatch instrumentation**: 3-line addition to Emma's `reasoning.py` — see handoff for copy-paste snippet. Enables live trace dashboard for demo.

## Hackathon

Consult&Co internal hackathon, 11–15 May 2026.
