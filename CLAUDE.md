# Consult&Co — Financial Readiness Tool

Closing-readiness + data quality engine for Fietsatelier Morgenwind BV (Dutch bicycle workshop). Responsible AI demo: system refuses to call Claude if data is dirty.

## Ownership (as of Day 5, post-handoff)
Toyesh owns everything: backend (`backend/`), FastAPI routes (`backend_FastAPI_emma/`), Next.js frontend (`frontend/`), deployment. Emma scaffolded the FastAPI + frontend layers then handed off. `models.py` is the shared contract.

## Data sources
- **Primary:** Exact Online REST API via OAuth (`backend/services/data_loader.py:load_all_from_exact`). The `/api/v1/readiness` endpoint auto-detects authentication and uses live data when a token is stored.
- **Tax filing PDFs:** `demo_seed/tax_pdfs/` (committed, ships to Railway). Path configurable via `TAX_PDF_DIR` env var. These have no Exact Online equivalent — production design would expose a file-upload widget for client-supplied filings.
- **Offline dev fallback:** `00 Dataroom hackathon/` (gitignored). Used by `load_all()` when no OAuth token is present.
- OAuth redirect URI: `https://unwired-sweep-apostle.ngrok-free.dev/auth/exact/callback` (dev / ngrok static domain). Production registers the Railway domain.

## LLM
Direct Anthropic SDK, model `claude-sonnet-4-6` (override via `ANTHROPIC_MODEL`). LangWatch tracing wraps both `call_claude` / `call_claude_guided` *and* `ReadinessEngine.run()` so the responsible-AI guardrail itself appears as a span in the dashboard.

## Test command
```
pytest tests/test_integration.py -v
```

If pytest fails at startup with a `protobuf` / "Descriptors cannot be created directly" error, your global Python has `ethpm` or another protobuf-bound package conflicting with langwatch's protobuf 6.x. Workaround:
```
PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python pytest tests/test_integration.py -v
```
Or use a venv (`python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`) to isolate from system packages. Railway / production aren't affected.

## Key invariants
- `advice_ready: bool` on `DataReadinessReport` gates advisory Claude calls — if False, call guided-diagnosis Claude instead (not a hard block)
- Any check with `status="blocker"` → `advice_ready = False` (gates advice regardless of numeric score)
- Scoring: `1.0 - penalties`; high=0.20, medium=0.10, low=0.03; ready at score ≥ 0.6
- `DataReadinessReport.ratios: FinancialRatios | None` — always populated from `financial_ratios.py`. Fields: `dso_days`, `dpo_days`, `working_capital`, `revenue_period`, `purchases_period`, `open_ar`, `open_ap`, `gross_profit_margin`; each is a `RatioResult(value, reliable, note)`.
- `AnalysisResult` schema in `backend_FastAPI_emma/schemas.py` exposes `readiness.ratios` to the frontend (already wired).
- AR/AP matching and `compute_ratios._open_invoices` match on **gross** (`bedrag + btw_bedrag`) so Dutch 21% VAT doesn't break invoice-to-bank reconciliation.
- Pydantic models reject NaN floats at the boundary (`models.py:_no_nan`); the loader (`data_loader.py:_records_with_none`) converts pandas NaN → Python None before that boundary.

## Dutch column names (confirmed from actual files)
| File type | Column | Meaning |
|---|---|---|
| GL entries | `boekdatum` | booking date |
| GL entries | `bedrag` | signed amount |
| GL entries | `grootboekrekening` | account code |
| GL entries | `omschrijving` | description |
| GL entries | `boekstuknummer` | record/document ID |
| GL entries | `periode` | accounting period |
| Bank entries | `datum` | date |
| Bank entries | `bedrag` | amount |
| Bank entries | `naam` | counterparty name |
| Bank entries | `code` | counterparty code |

Account code ranges: `0xxx`=CAPEX, `1250`=suspense/clearing ("Nog te duiden"), `1300`=AR, `1700`=AP, `1870`=VAT, `4xxx`=OPEX, `7xxx`=COGS, `8xxx`=revenue

## Loading quirks
- `header=1` for relations (01) and opening_balances (02) files — row 0 is Dutch section labels, row 1 is real header
- `header=None` for sales (04) and purchase (05) files — no header row, use positional mapping
- Dates: `dayfirst=True` (Dutch DD-MM-YYYY format)
- Amounts: strip `€`, replace `,` with `.`
- Relations sheet name: `"Invoerblad relaties"`

## Frontend (Toyesh now owns this too)
- Next.js 16 + Tailwind v4 + Inter font. Brand: navy/cream/rose mirroring consultenco.nl.
- Shared components in `frontend/components/`: `Header`, `StatusBadge`, `ScoreGauge`, `KpiTile`, `CheckCard`.
- Shared helpers in `frontend/lib/`: `format.ts` (nl-NL currency, parens for negatives, compact form), `api.ts` (centralized fetch + `NEXT_PUBLIC_API_URL`).
- Home is two-mode: pre-run controls if no `analysis_result` in localStorage; executive summary (gauge + KPIs + top issues + re-run drawer) otherwise.
- Animations: `fade-in-up` (400ms) and `gauge-fill` (700ms), both honor `prefers-reduced-motion`.
- The `frontend-design-guidelines`, `design-taste`, `page-load-animations`, `number-formatting` skills informed the polish pass. `frontend-design:frontend-design` (build-from-scratch) is NOT used.
- Brand color tokens live in `frontend/app/globals.css` `@theme` block. Status colors: navy=pass, rose-deep=blocker, amber=fail+warn.

## Check IDs (locked — frontend reads these from the API)

| check_id | severity | trigger |
|---|---|---|
| `suspense_account_balance` | blocker | any GL entry on account 1250 |
| `revenue_reconciliation` | high | GL 8xxx ≠ sales sum >1% |
| `capex_opex_misclassification` | medium | asset keywords in 4xxx >€1000 |
| `bank_statement_coverage` | medium | <90% business day coverage |
| `ar_aging_stale` | medium | open receivables >90 days |
| `timing_differences` | medium | GL `periode` ≠ `boekdatum.month` |
| `vat_reconciliation` | medium | GL VAT ≠ PDF total >1% |
| `cit_preliminary_deviation` | medium | provisional CIT ≠ final assessment >10% |
| `vat_provisional_correction` | medium | multiple VAT payments per quarter in tax schedule |
| `ap_aging_stale` | medium | open payables >90 days |

Note: `draft_entries` does NOT exist — dropped Day 1 (no status column in data). `todo_discrepancy` removed Day 5 — was a local-filesystem concept with no Exact Online equivalent. Frontend already aligned.

## OAuth security
`/auth/exact/redirect` sets a short-lived HttpOnly state cookie and includes the same value in the OAuth authorize URL. `/auth/exact/callback` rejects with 400 if the state query param doesn't match the cookie (CSRF guard for the single-row token store). Token refreshes are serialized through `_refresh_lock` so concurrent requests don't race on the rotating refresh token.

## Running locally
```bash
# Backend
uvicorn backend_FastAPI_emma.main:app --host 127.0.0.1 --port 8000 --reload --workers 1

# Frontend
cd frontend && npm run dev

# ngrok for OAuth (must use 127.0.0.1, NOT localhost — macOS resolves localhost to ::1)
ngrok http --domain=unwired-sweep-apostle.ngrok-free.dev 127.0.0.1:8000
```
`--workers 1` is important: the `/readiness/{check_id}/sources` endpoint reads a module-level cache populated by the POST handler.
