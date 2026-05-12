# Consult&Co Financial Readiness Tool

Financial data quality gate for Dutch SME closing. Ingests raw bookkeeping exports, runs deterministic checks, and gates AI advisory behind a readiness score.

**Responsible AI principle:** Claude is never called on dirty data. The harness engine is the gatekeeper.

## Architecture

```
00 Dataroom hackathon/   (local only — never commit)
        │
        ▼
backend/services/data_loader.py     loads all Excel/CSV/PDF files → FinancialDataset
        │
        ▼
backend/services/readiness_engine.py  runs 8 deterministic checks → DataReadinessReport
        │
        ├─ advice_ready = False → block Claude, show blocker reason
        └─ advice_ready = True  → POST to Claude Sonnet → financial advice
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

## Hackathon

Consult&Co internal hackathon, 11–15 May 2026.
