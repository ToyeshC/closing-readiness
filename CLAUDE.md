# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run all tests
pytest tests/ -v

# Run a single test
pytest tests/test_integration.py::<test_name> -v

# Start the API server (once backend/main.py exists)
uvicorn backend.main:app --reload
```

No linter or formatter is configured yet.

## Architecture

This is a financial data quality assessment tool for an SME client (Fietsatelier Morgenwind BV). The core design principle: **Claude only runs when data is clean enough.** A deterministic engine gates AI advice behind a scored readiness report.

### Data flow

```
data_loader.load_all()
  → FinancialDataset
    → ReadinessEngine(dataset).run()
      → DataReadinessReport  (score 0.0–1.0, advice_ready bool)
        → if advice_ready: call Claude → list[AdvisoryOutput]
          → AnalysisResult
```

### Shared contract — `backend/models.py`

This is the interface between two workstreams. **Never modify without aligning with Toyesh.** Key models:

| Model | Role |
|---|---|
| `FinancialDataset` | Output of `data_loader.load_all()` — 12 list fields of normalized records |
| `DataReadinessReport` | Output of `ReadinessEngine.run()` — score, `advice_ready`, list of `ReadinessCheck` |
| `SourceLine` | Audit trail record attached to every check failure — entity, account, amount, date, raw dict |
| `AdvisoryOutput` | Claude's typed output — type (`FACT`/`ASSUMPTION`/`ADVICE`), statement, source, `source_record_ids` |
| `AnalysisResult` | Final API response — wraps the report and advisory outputs (or `blocked_reason`) |

Check status values: `"pass"`, `"warn"`, `"fail"`, `"blocker"`.  
Severity values: `"low"`, `"medium"`, `"high"`, `"blocker"`.

### Responsible AI gate

- Any check with severity `"blocker"` → `advice_ready=False`, `overall_score=0.0`
- Score ≥ 0.6 required for `advice_ready=True`
- Scoring penalties: blocker=full block, high=−0.20, medium=−0.10, low=−0.03
- Never call Claude if `advice_ready=False`; return `blocked_reason` instead

### Traceability requirement

Every `ReadinessCheck` must populate `source_lines` on any non-pass status. Every `AdvisoryOutput` must populate `source_record_ids`. The UI's "Show source" button calls `GET /api/v1/readiness/{check_id}/sources` which returns these lines.

### Data folder

`00 Dataroom hackathon/` is gitignored (real client financial data — never commit). The `to do/` subfolder inside it is a **business logic signal**: files there are records not yet imported into the accounting system (readiness check #9). Its presence triggers a discrepancy, captured in `FinancialDataset.todo_discrepancies`.

### Dutch data quirks

- Column names are Dutch: `boekdatum`, `bedrag` (signed amount), `grootboekrekening`, `omschrijving`, `periode`
- Sales/purchase Excel files are **headerless** — loaded positionally (23 columns; key cols at positions 13, 15, 19, 21)
- Bank CSV is semicolon-delimited
- Relations Excel uses `header=1` (row 0 is section labels, not column names)
- Account code ranges: `0xxx`=assets, `1250`=suspense, `13xx`=AR, `17xx`=AP, `4xxx`=OPEX, `7xxx`=COGS, `8xxx`=revenue

### Workstream split

**Toyesh** (`toyesh` branch): `data_loader.py`, `normalizer.py`, `readiness_engine.py`, `checks/` (9 readiness checks)

**Emma** (`emma` branch): FastAPI routes, Anthropic integration, Next.js frontend, Railway + Vercel deployment

- FastAPI endpoints: `POST /api/v1/readiness` → `DataReadinessReport`; `GET /api/v1/readiness/{check_id}/sources` → `SourceLine[]`
- Anthropic model: `claude-sonnet-4-20250514`, `max_tokens=1000` (raise to 2000 if responses are truncated)
- Pass summarised/sliced data to Claude — never raw data dumps (token budget is tight)
- Frontend: 3 screens — Connect → Readiness Report → Advisory Output

### Branch rules

- `main` — verified code only; merge daily
- `toyesh` — engine development
- `emma` — FastAPI/frontend development
